import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { db, subscriptionsTable, downloadsTable, usersTable } from "@workspace/db";
import { eq, and, gt, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { SubscriptionCallbackBody } from "@workspace/api-zod";
import { getSetting } from "../lib/settings";

const router: IRouter = Router();

router.get("/subscription/status", requireAuth, async (req, res): Promise<void> => {
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

  const [downloadsResult] = await db
    .select({ count: count() })
    .from(downloadsTable)
    .where(eq(downloadsTable.userId, userId));

  const downloadsCount = Number(downloadsResult?.count ?? 0);
  const freeLimit = Number(await getSetting("free_downloads_per_user"));
  const subscriptionPrice = Number(await getSetting("subscription_price"));
  const currency = await getSetting("currency");

  res.json({
    isActive: !!activeSub,
    expiresAt: activeSub?.expiresAt ?? null,
    downloadsCount,
    remainingFreeDownloads: activeSub
      ? 999
      : Math.max(0, freeLimit - downloadsCount),
    subscriptionPrice,
    currency,
  });
});

router.post("/subscription/subscribe", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [user] = await db
    .select({ name: usersTable.name, email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const amount = Number(await getSetting("subscription_price"));
  const currency = await getSetting("currency");
  const paylorApiKey = await getSetting("paylor_api_key");
  const paylorApiUrl = await getSetting("paylor_api_url");
  const paylorChannelId = await getSetting("paylor_channel_id");

  if (!paylorApiKey || !paylorApiUrl) {
    res.status(500).json({ error: "Payment gateway not configured" });
    return;
  }

  const reference = `TKT-${userId}-${Date.now()}`;

  // Generate a one-time secret token that is embedded in our callback URL.
  // The token is never exposed to the user — only Paylor receives it via the
  // callback_url parameter.  The callback handler requires both a matching
  // reference AND this token, so a user who learns their own `reference` still
  // cannot self-activate because they never see the token.
  const callbackToken = randomUUID();

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  await db.insert(subscriptionsTable).values({
    userId,
    status: "pending",
    amountPaid: String(amount),
    currency,
    paymentReference: reference,
    callbackToken,
    expiresAt,
  });

  try {
    const appUrl = process.env.APP_URL ?? "";
    // The secret token is embedded in the callback URL, not the body.
    // Paylor will POST back to this URL; the user is only redirected to
    // paymentUrl and never sees the token.
    const callbackUrl = `${appUrl}/api/subscription/callback?token=${callbackToken}`;

    const paymentPayload: Record<string, unknown> = {
      amount,
      currency,
      reference,
      phone: user?.phone ?? "",
      email: user?.email ?? "",
      name: user?.name ?? "",
      callback_url: callbackUrl,
      description: "TikTok Downloader Monthly Subscription",
    };

    // channelId is required by Paylor to identify your merchant channel
    if (paylorChannelId) {
      paymentPayload.channelId = paylorChannelId;
    }

    const paylorResponse = await fetch(`${paylorApiUrl}api/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${paylorApiKey}`,
      },
      body: JSON.stringify(paymentPayload),
    });

    if (!paylorResponse.ok) {
      const errorData = await paylorResponse.text();
      req.log.error({ status: paylorResponse.status, body: errorData }, "Paylor payment initiation failed");
      res.status(500).json({ error: "Payment initiation failed" });
      return;
    }

    const paylorData = (await paylorResponse.json()) as {
      payment_url?: string;
      url?: string;
    };

    const paymentUrl = paylorData.payment_url ?? paylorData.url ?? "";

    // Do NOT expose reference or callbackToken to the client.
    // The user is redirected to paymentUrl only; Paylor holds the callback URL.
    res.json({
      paymentUrl,
      amount,
      currency,
    });
  } catch (err) {
    req.log.error({ err }, "Error contacting Paylor");
    res.status(500).json({ error: "Payment gateway error" });
  }
});

router.post("/subscription/callback", async (req, res): Promise<void> => {
  const parsed = SubscriptionCallbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid callback data" });
    return;
  }
  const { reference, status, amount } = parsed.data;

  // The callbackToken is embedded in the URL, not the body, so the user
  // cannot forge it even if they know their own payment reference.
  const callbackToken = typeof req.query.token === "string" ? req.query.token : null;

  req.log.info({ reference, status, amount, hasToken: !!callbackToken }, "Paylor callback received");

  if (!callbackToken) {
    req.log.warn({ reference }, "Callback received without token");
    res.status(400).json({ error: "Missing callback token" });
    return;
  }

  const SUCCESSFUL_STATUSES = new Set(["success", "completed", "paid"]);

  if (SUCCESSFUL_STATUSES.has(status)) {
    // Only activate subscriptions where both the reference AND the secret
    // callbackToken match, ensuring Paylor (not the user) triggered this.
    const [pendingSub] = await db
      .select()
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.paymentReference, reference),
          eq(subscriptionsTable.callbackToken, callbackToken),
          eq(subscriptionsTable.status, "pending")
        )
      );

    if (!pendingSub) {
      req.log.warn({ reference }, "Callback received for unknown, token-mismatched, or already-processed reference");
      res.status(400).json({ error: "Invalid or already processed payment" });
      return;
    }

    await db
      .update(subscriptionsTable)
      .set({ status: "active" })
      .where(eq(subscriptionsTable.id, pendingSub.id));

    req.log.info({ userId: pendingSub.userId, reference }, "Subscription activated");
  }

  res.json({ message: "Callback processed" });
});

export default router;
