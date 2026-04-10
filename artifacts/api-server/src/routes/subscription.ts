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

  // Allow the user to specify a different M-Pesa number for payment.
  // If not provided, fall back to their registered phone.
  const paymentPhone: string = (typeof req.body?.phone === "string" && req.body.phone.trim())
    ? req.body.phone.trim()
    : (user?.phone ?? "");

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
    // Derive the public base URL automatically from the incoming request.
    // Works in every environment (Replit dev, Replit deployed, Vercel, etc.)
    // without any manual configuration. APP_URL env var can override if needed.
    const forwardedProto =
      (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim()
      ?? req.protocol
      ?? "https";
    const forwardedHost =
      (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim()
      ?? req.hostname;
    const appUrl = process.env.APP_URL ?? `${forwardedProto}://${forwardedHost}`;

    // The secret token is embedded in the callback URL, not the body.
    // Paylor will POST back to this URL; the user is only redirected to
    // paymentUrl and never sees the token.
    const callbackUrl = `${appUrl}/api/subscription/callback?token=${callbackToken}`;
    req.log.info({ callbackUrl }, "Paylor callback URL constructed");

    if (!paylorChannelId) {
      res.status(500).json({ error: "Payment channel not configured. Contact the admin." });
      return;
    }

    // Paylor STK push payload — sends an M-Pesa prompt directly to the phone.
    // Reference: POST https://api.paylorke.com/api/v1/merchants/payments/stk-push
    const paymentPayload: Record<string, unknown> = {
      amount,
      currency,
      reference,
      phone: paymentPhone,
      email: user?.email ?? "",
      name: user?.name ?? "",
      callback_url: callbackUrl,
      description: "TokSaver Monthly Subscription",
      channelId: paylorChannelId,
    };

    // Paylor API base URL is stored without trailing slash (e.g. https://api.paylorke.com/api/v1)
    const stkPushUrl = `${paylorApiUrl.replace(/\/$/, "")}/merchants/payments/stk-push`;

    const paylorResponse = await fetch(stkPushUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${paylorApiKey}`,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paylorText = await paylorResponse.text();
    let paylorData: Record<string, unknown> = {};
    try { paylorData = JSON.parse(paylorText); } catch { /* non-JSON body */ }

    if (!paylorResponse.ok) {
      req.log.error({ status: paylorResponse.status, body: paylorText, url: stkPushUrl }, "Paylor STK push failed");
      const paylorMsg = (paylorData?.error as Record<string, unknown>)?.message as string | undefined
        ?? paylorData?.message as string | undefined
        ?? "Payment initiation failed";
      res.status(500).json({ error: paylorMsg });
      return;
    }

    req.log.info({ status: paylorResponse.status, body: paylorText }, "Paylor STK push initiated");

    // Paylor STK push does not return a payment URL — it sends an M-Pesa prompt
    // directly to the user's phone. Activation happens via the callback webhook.
    res.json({
      stkSent: true,
      amount,
      currency,
      message: "M-Pesa payment prompt sent to your phone. Enter your PIN to confirm.",
    });
  } catch (err) {
    req.log.error({ err }, "Error contacting Paylor");
    res.status(500).json({ error: "Payment gateway error" });
  }
});

router.post("/subscription/callback", async (req, res): Promise<void> => {
  // Log the raw body first — regardless of schema validity — so we never
  // silently lose a callback from Paylor due to schema mismatch.
  req.log.info({ rawBody: req.body }, "Paylor raw callback received");

  const parsed = SubscriptionCallbackBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.issues, body: req.body }, "Paylor callback body failed schema validation");
    // Still return 200 so Paylor doesn't keep retrying with an invalid payload.
    res.status(200).json({ message: "Callback received but ignored (schema mismatch)" });
    return;
  }
  const { reference, status, amount } = parsed.data;

  // The callbackToken is embedded in the URL, not the body, so the user
  // cannot forge it even if they know their own payment reference.
  const callbackToken = typeof req.query.token === "string" ? req.query.token : null;

  req.log.info({ reference, status, amount, hasToken: !!callbackToken }, "Paylor callback parsed");

  if (!callbackToken) {
    req.log.warn({ reference }, "Callback received without token");
    res.status(400).json({ error: "Missing callback token" });
    return;
  }

  // Case-insensitive — Paylor may send "COMPLETED", "SUCCESS", "PAID", etc.
  const SUCCESSFUL_STATUSES = new Set(["success", "completed", "paid"]);

  if (SUCCESSFUL_STATUSES.has(status.toLowerCase())) {
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
