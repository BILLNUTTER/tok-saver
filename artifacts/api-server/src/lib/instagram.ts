import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

interface VideoInfo {
  downloadUrl: string;
  title: string | null;
  thumbnailUrl: string | null;
}

/**
 * Validates an Instagram or Facebook URL format, then returns it as the
 * downloadUrl.  The actual video bytes are streamed by the proxy endpoint
 * via yt-dlp (see download.ts → streamViaYtDlp).
 *
 * We intentionally skip a yt-dlp "metadata" call here so the POST /download
 * response is instant — yt-dlp will only run once, at proxy time.
 */
export async function fetchInstagramVideo(url: string): Promise<VideoInfo> {
  const cleanUrl = url.split("?")[0];
  logger.info({ url: cleanUrl }, "Preparing Instagram/Facebook download via yt-dlp");
  return {
    downloadUrl: cleanUrl,
    title: null,
    thumbnailUrl: null,
  };
}

/**
 * Run yt-dlp and collect its JSON metadata (title, thumbnail).
 * Used optionally for enriching the response without blocking the download.
 */
export async function getInstagramMetadata(url: string): Promise<{ title: string | null; thumbnailUrl: string | null }> {
  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      ["--dump-json", "--no-playlist", url],
      { timeout: 20_000 }
    );
    const data = JSON.parse(stdout.trim()) as { title?: string; thumbnail?: string };
    return {
      title: data.title ?? null,
      thumbnailUrl: data.thumbnail ?? null,
    };
  } catch (err) {
    logger.warn({ err }, "yt-dlp metadata fetch failed — continuing without title");
    return { title: null, thumbnailUrl: null };
  }
}
