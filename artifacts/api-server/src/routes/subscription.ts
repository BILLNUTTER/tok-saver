import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { db, subscriptionsTable, downloadsTable, usersTable } from "@workspace/db";
import { eq, and, gt, count, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getSetting } from "../lib/settings";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helper: build current subscription status response for a user
// ---------------------------------------------------------------------------
async function buildSubscriptionStatus(userId: number) {
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

  return {
    isActive: !!activeSub,
    expiresAt: activeSub?.expiresAt ?? null,
    downloadsCount,
    remainingFreeDownloads: activeSub ? 999 : Math.max(0, freeLimit - downloadsCount),
    subscriptionPrice,
    currency,
  };
}

router.get("/subscription/status", requireAuth, async (req, res): Promise<void> => {
  res.json(await buildSubscriptionStatus(req.userId!));
});

router.post("/subscription/subscribe", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [user] = await db
    .select({ name: usersTable.name, email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

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
  if (!paylorChannelId) {
    res.status(500).json({ error: "Payment channel not configured. Contact the admin." });
    return;
  }

  const reference = `TKT-${userId}-${Date.now()}`;
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
    const forwardedProto =
      (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() ?? "https";
    const forwardedHost =
      (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() ?? req.hostname;
    const appUrl = process.env.APP_URL ?? `${forwardedProto}://${forwardedHost}`;
    const callbackUrl = `${appUrl}/api/subscription/callback?token=${callbackToken}`;

    req.log.info({ callbackUrl, reference }, "Initiating Paylor STK push");

    const stkPushUrl = `${paylorApiUrl.replace(/\/$/, "")}/merchants/payments/stk-push`;

    const paylorResponse = await fetch(stkPushUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${paylorApiKey}`,
      },
      body: JSON.stringify({
        amount,
        currency,
        reference,
        phone: paymentPhone,
        email: user?.email ?? "",
        name: user?.name ?? "",
        callback_url: callbackUrl,
        description: "TokSaver Monthly Subscription",
        channelId: paylorChannelId,
      }),
    });

    const paylorText = await paylorResponse.text();
    let paylorData: Record<string, unknown> = {};
    try { paylorData = JSON.parse(paylorText); } catch { /* non-JSON */ }

    if (!paylorResponse.ok) {
      req.log.error({ status: paylorResponse.status, body: paylorText }, "Paylor STK push failed");
      const msg = (paylorData?.error as Record<string, unknown>)?.message as string | undefined
        ?? paylorData?.message as string | undefined
        ?? "Payment initiation failed";
      res.status(500).json({ error: msg });
      return;
    }

    req.log.info({ reference, body: paylorText }, "Paylor STK push initiated");
    res.json({
      stkSent: true,
      reference,
      amount,
      currency,
      message: "M-Pesa payment prompt sent to your phone. Enter your PIN to confirm.",
    });
  } catch (err) {
    req.log.error({ err }, "Error contacting Paylor");
    res.status(500).json({ error: "Payment gateway error" });
  }
});

// ---------------------------------------------------------------------------
// Paylor payment callback — called by Paylor after payment completes.
// Always returns 200 to stop Paylor retries regardless of outcome.
// Matches by paymentReference only (not token) because some gateways
// strip query parameters from the callback URL.
// ---------------------------------------------------------------------------
router.post("/subscription/callback", async (req, res): Promise<void> => {
  req.log.info({ rawBody: req.body, query: req.query }, "Paylor raw callback received");

  // Accept any field name Paylor might use for reference and status.
  const body = req.body as Record<string, unknown>;

  // Walk nested objects in case Paylor wraps data (e.g. body.data.reference)
  const flat = { ...body, ...(body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {}) };

  const reference = (
    flat.reference ?? flat.payment_reference ?? flat.order_id ?? flat.ref ??
    flat.transaction_id ?? flat.transactionId ?? flat.merchantReference ?? ""
  ) as string;

  const status = (
    flat.status ?? flat.payment_status ?? flat.transaction_status ??
    flat.paymentStatus ?? flat.state ?? ""
  ) as string;

  req.log.info({ reference, status }, "Paylor callback parsed");

  if (!reference || !status) {
    req.log.warn({ body }, "Callback missing reference or status — returning 200 to stop retries");
    res.status(200).json({ message: "ok" });
    return;
  }

  const SUCCESSFUL_STATUSES = new Set(["success", "completed", "paid", "approved", "successful", "complete"]);

  if (SUCCESSFUL_STATUSES.has(status.toLowerCase())) {
    // Match by reference alone — token is a nice-to-have but may be stripped by the gateway
    const [pendingSub] = await db
      .select()
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.paymentReference, reference),
          eq(subscriptionsTable.status, "pending")
        )
      );

    if (!pendingSub) {
      req.log.warn({ reference }, "No matching pending subscription — may already be active");
    } else {
      await db
        .update(subscriptionsTable)
        .set({ status: "active" })
        .where(eq(subscriptionsTable.id, pendingSub.id));

      req.log.info({ userId: pendingSub.userId, reference }, "Subscription activated via callback");
    }
  }

  res.status(200).json({ message: "ok" });
});

// ---------------------------------------------------------------------------
// Manual payment verification — user clicks "Check Payment" button.
// First checks if callback already activated the subscription.
// If still pending, queries Paylor's API to manually confirm the payment.
// ---------------------------------------------------------------------------
router.post("/subscription/verify", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  // If already active via callback, just return the status.
  const status = await buildSubscriptionStatus(userId);
  if (status.isActive) {
    res.json(status);
    return;
  }

  // Find the most recent pending subscription to verify.
  const [pendingSub] = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.userId, userId),
        eq(subscriptionsTable.status, "pending")
      )
    )
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);

  if (!pendingSub) {
    // No pending subscription — return current status (not active).
    res.json(status);
    return;
  }

  const paylorApiKey = await getSetting("paylor_api_key");
  const paylorApiUrl = await getSetting("paylor_api_url");
  const baseUrl = paylorApiUrl.replace(/\/$/, "");
  const reference = pendingSub.paymentReference;

  const SUCCESSFUL_STATUSES = new Set(["success", "completed", "paid", "approved"]);
  let paymentConfirmed = false;

  // Try Paylor's transaction lookup endpoints (best-effort).
  const checkUrls = [
    `${baseUrl}/merchants/payments/${reference}`,
    `${baseUrl}/merchants/transactions/${reference}`,
    `${baseUrl}/merchants/payments?reference=${reference}`,
  ];

  for (const url of checkUrls) {
    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${paylorApiKey}` },
      });
      if (!resp.ok) continue;
      const data = await resp.json() as Record<string, unknown>;
      const txStatus = (
        data.status ?? data.payment_status ?? data.transaction_status ?? ""
      ) as string;
      if (SUCCESSFUL_STATUSES.has(txStatus.toLowerCase())) {
        paymentConfirmed = true;
        break;
      }
    } catch {
      // Try next endpoint
    }
  }

  if (paymentConfirmed) {
    await db
      .update(subscriptionsTable)
      .set({ status: "active" })
      .where(eq(subscriptionsTable.id, pendingSub.id));

    res.json(await buildSubscriptionStatus(userId));
    return;
  }

  // Return current status (not yet confirmed).
  res.json(status);
});

export default router;
