import { Router, type IRouter, type Request, type Response } from "express";
import { db, downloadsTable, subscriptionsTable } from "@workspace/db";
import { eq, and, gt, count, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { DownloadVideoBody } from "@workspace/api-zod";
import { fetchTikTokVideo } from "../lib/tiktok";
import { getSetting } from "../lib/settings";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";

const router: IRouter = Router();

function detectPlatform(url: string): "tiktok" | "facebook" | null {
  if (/tiktok\.com|vm\.tiktok\.com/i.test(url)) return "tiktok";
  if (/facebook\.com|fb\.watch|fb\.com/i.test(url)) return "facebook";
  return null;
}

router.post("/download", requireAuth, async (req, res): Promise<void> => {
  const parsed = DownloadVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { url } = parsed.data;

  const platform = detectPlatform(url);
  if (!platform) {
    res.status(400).json({ error: "Unsupported URL. Please paste a TikTok or Facebook video link." });
    return;
  }

  const userId = req.userId!;
  const now = new Date();

  const [activeSub] = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.userId, userId),
        eq(subscriptionsTable.status, "active"),
        gt(subscriptionsTable.expiresAt, now)
      )
    );

  const freeLimit = Number(await getSetting("free_downloads_per_user"));
  const [downloadsResult] = await db
    .select({ count: count() })
    .from(downloadsTable)
    .where(eq(downloadsTable.userId, userId));
  const downloadsCount = Number(downloadsResult?.count ?? 0);

  if (!activeSub && downloadsCount >= freeLimit) {
    const subPrice = Number(await getSetting("subscription_price"));
    const currency = await getSetting("currency");
    res.status(402).json({
      error: "Free download quota exhausted. Please subscribe to continue.",
      subscriptionPrice: subPrice,
      currency,
    });
    return;
  }

  try {
    let videoInfo: { downloadUrl: string; title: string | null; thumbnailUrl: string | null };

    if (platform === "facebook") {
      const { fetchInstagramVideo } = await import("../lib/instagram");
      videoInfo = await fetchInstagramVideo(url);
    } else {
      videoInfo = await fetchTikTokVideo(url);
    }

    await db.insert(downloadsTable).values({ userId, url });

    const remainingFreeDownloads = activeSub
      ? 999
      : Math.max(0, freeLimit - downloadsCount - 1);

    res.json({
      downloadUrl: videoInfo.downloadUrl,
      title: videoInfo.title,
      thumbnailUrl: videoInfo.thumbnailUrl,
      remainingFreeDownloads,
    });
  } catch (err) {
    req.log.error({ err, platform }, "Failed to fetch video");
    res.status(422).json({ error: `Could not process this ${platform} URL. Please check the link and try again.` });
  }
});

router.get("/downloads/history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const downloads = await db
    .select()
    .from(downloadsTable)
    .where(eq(downloadsTable.userId, userId))
    .orderBy(desc(downloadsTable.downloadedAt))
    .limit(50);

  res.json(
    downloads.map((d) => ({
      id: d.id,
      url: d.url,
      downloadedAt: d.downloadedAt,
    }))
  );
});

const ALLOWED_CDN_HOSTS = [
  "tikcdn.io",
  "tikwm.com",
  "tiktokcdn.com",
  "tiktokcdn-eu.com",
  "tiktokcdn-us.com",
  "akamaized.net",
  "v19-webapp.tiktok.com",
  "v19.tiktokcdn.com",
  "fbcdn.net",
];

async function streamViaYtDlp(rawUrl: string, filename: string, req: Request, res: Response): Promise<void> {
  req.log.info({ url: rawUrl }, "Streaming via yt-dlp");

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");

  const args: string[] = [
    "-f", "best[ext=mp4][vcodec!*=none][acodec!*=none]/best[ext=mp4]/best",
    "--no-playlist",
    "--no-warnings",
    "-o", "-",
    rawUrl,
  ];

  const proc = spawn("yt-dlp", args);

  proc.stdout.pipe(res);

  proc.stderr.on("data", (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) req.log.info({ ytdlp: msg }, "yt-dlp");
  });

  proc.on("error", (err) => {
    req.log.error({ err }, "yt-dlp spawn error");
    if (!res.headersSent) res.status(502).json({ error: "Failed to stream video" });
    else if (!res.writableEnded) res.end();
  });

  proc.on("close", (code) => {
    if (code !== 0) req.log.warn({ code }, "yt-dlp exited with non-zero code");
    if (!res.writableEnded) res.end();
  });

  req.on("close", () => {
    if (proc.exitCode === null) proc.kill();
  });
}

router.get("/download-proxy", requireAuth, async (req, res): Promise<void> => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url : null;
  const filename = typeof req.query.filename === "string" ? req.query.filename : "video.mp4";

  if (!rawUrl) {
    res.status(400).json({ error: "Missing url query parameter" });
    return;
  }

  if (/facebook\.com|fb\.watch|fb\.com/i.test(rawUrl)) {
    await streamViaYtDlp(rawUrl, filename, req, res);
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  if (parsed.protocol !== "https:") {
    res.status(400).json({ error: "Only HTTPS URLs are allowed" });
    return;
  }

  const hostname = parsed.hostname;
  const allowed = ALLOWED_CDN_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));
  if (!allowed) {
    res.status(400).json({ error: "URL host not allowed" });
    return;
  }

  try {
    const upstream = await fetch(rawUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TokSaver/1.0)" },
    });

    if (!upstream.ok) {
      res.status(502).json({ error: "Failed to fetch video from source" });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";
    const contentLength = upstream.headers.get("content-length");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    if (upstream.body) {
      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
      nodeStream.pipe(res);
      nodeStream.on("error", (err) => {
        req.log.error({ err }, "Proxy stream error");
        if (!res.headersSent) res.status(502).end();
      });
    } else {
      res.status(502).json({ error: "No body from source" });
    }
  } catch (err) {
    req.log.error({ err }, "download-proxy fetch error");
    res.status(502).json({ error: "Failed to proxy video" });
  }
});

export default router;
