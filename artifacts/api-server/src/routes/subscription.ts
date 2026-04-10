import { Router, type IRouter, type Request } from "express";
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
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
    // Prefer admin-configured app_url, then APP_URL env var, then derive from headers.
    const configuredAppUrl = await getSetting("app_url");
    const forwardedProto =
      (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() ?? "https";
    const forwardedHost =
      (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() ?? req.hostname;
    const appUrl = configuredAppUrl || process.env.APP_URL || `${forwardedProto}://${forwardedHost}`;
    const callbackUrl = `${appUrl}/api/subscription/callback`;

    req.log.info({ callbackUrl, appUrl, configuredAppUrl, reference }, "Initiating Paylor STK push");

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

    // Extract Paylor's own payment/transaction ID from the response for future status checks
    let paylorPaymentId: string | null = null;
    try {
      const d = paylorData as Record<string, unknown>;
      const inner = (d.data && typeof d.data === "object" ? d.data : d) as Record<string, unknown>;
      paylorPaymentId = (inner.paymentId ?? inner.payment_id ?? inner.transactionId ??
        inner.transaction_id ?? inner.id ?? inner.reference ?? null) as string | null;
    } catch { /* ignore */ }

    if (paylorPaymentId) {
      await db.update(subscriptionsTable)
        .set({ paylorPaymentId })
        .where(eq(subscriptionsTable.paymentReference, reference));
    }

    req.log.error({ reference, paylorPaymentId, paylorFullResponse: paylorText.slice(0, 1000) }, "Paylor STK push initiated — full response");
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
// Paylor may send a GET ping to verify the webhook endpoint is reachable.
// ---------------------------------------------------------------------------
router.get("/subscription/callback", (_req, res): void => {
  res.status(200).json({ message: "ok" });
});

// ---------------------------------------------------------------------------
// Paylor payment callback — called by Paylor after payment completes.
// Always returns 200 to stop Paylor retries regardless of outcome.
// Matches by paymentReference only (not token) because some gateways
// strip query parameters from the callback URL.
// ---------------------------------------------------------------------------
router.post("/subscription/callback", async (req, res): Promise<void> => {
  // Verify Paylor webhook signature if a secret has been configured
  const webhookSecret = await getSetting("paylor_webhook_secret");
  if (webhookSecret) {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    // Paylor sends the signature in X-Payment-Signature header
    const sigHeader = (
      req.headers["x-payment-signature"] ??
      req.headers["x-paylor-signature"] ??
      req.headers["x-webhook-signature"] ??
      req.headers["x-signature"] ??
      ""
    ) as string;

    req.log.error({ sigHeader: sigHeader.slice(0, 80) }, "Paylor webhook signature header");

    if (sigHeader && rawBody) {
      const payload = rawBody.toString("utf8");
      // Support "sha256=<hex>" format or raw hex
      const receivedHex = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
      const expected = createHmac("sha256", webhookSecret).update(payload).digest("hex");
      try {
        const match = timingSafeEqual(Buffer.from(receivedHex, "hex"), Buffer.from(expected, "hex"));
        if (!match) {
          req.log.error({ receivedHex, expected }, "Paylor webhook signature mismatch — rejecting");
          res.status(401).json({ error: "Invalid signature" });
          return;
        }
        req.log.error({}, "Paylor webhook signature verified OK");
      } catch {
        req.log.error({ receivedHex, expected }, "Paylor webhook signature comparison failed");
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    } else {
      req.log.error({ hasSigHeader: !!sigHeader, hasRawBody: !!rawBody }, "Paylor webhook: secret configured but no signature header or raw body — proceeding without verification");
    }
  }

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
// Payment verification — DB check + Paylor transaction status lookup.
// Paylor's STK push returns a transactionId. We use that to query:
// GET /merchants/payments/{transactionId} for the confirmed status.
// ---------------------------------------------------------------------------
router.post("/subscription/verify", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  // 1. Fast DB check first
  const dbStatus = await buildSubscriptionStatus(userId);
  if (dbStatus.isActive) {
    res.json(dbStatus);
    return;
  }

  // 2. Find pending subscription that has a Paylor transaction ID
  const [pendingSub] = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "pending")))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);

  if (!pendingSub?.paylorPaymentId) {
    res.json(dbStatus);
    return;
  }

  const paylorApiKey = await getSetting("paylor_api_key");
  const paylorApiUrl = await getSetting("paylor_api_url");
  if (!paylorApiKey || !paylorApiUrl) {
    res.json(dbStatus);
    return;
  }

  const baseUrl = paylorApiUrl.replace(/\/$/, "");
  const txId = pendingSub.paylorPaymentId;
  const PAID = new Set(["success", "completed", "paid", "approved", "successful", "complete"]);

  // Use the actual Paylor transactionId — only try endpoints with the real ID
  const checkUrls = [
    `${baseUrl}/merchants/payments/${txId}`,
    `${baseUrl}/merchants/transactions/${txId}`,
  ];

  const results = await Promise.allSettled(
    checkUrls.map(async (url) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${paylorApiKey}`, Accept: "application/json" },
          signal: ctrl.signal,
        });
        clearTimeout(t);
        const text = await resp.text();
        req.log.error({ url, httpStatus: resp.status, body: text.slice(0, 800), txId }, "Paylor status");
        if (!resp.ok) return null;
        const data = JSON.parse(text) as Record<string, unknown>;
        const flat = { ...data, ...(data.data && typeof data.data === "object" ? data.data as Record<string, unknown> : {}) };
        const txStatus = (flat.status ?? flat.payment_status ?? flat.state ?? "") as string;
        req.log.error({ txStatus, txId }, "Paylor status parsed");
        return PAID.has(txStatus.toLowerCase()) ? txStatus : null;
      } catch (err) {
        clearTimeout(t);
        req.log.error({ url, err: String(err) }, "Paylor status error");
        return null;
      }
    })
  );

  const winner = results.find((r) => r.status === "fulfilled" && r.value !== null);
  if (winner?.status === "fulfilled" && winner.value) {
    await db.update(subscriptionsTable).set({ status: "active" }).where(eq(subscriptionsTable.id, pendingSub.id));
    req.log.error({ userId, txId, txStatus: winner.value }, "Subscription activated via Paylor status check");
    res.json(await buildSubscriptionStatus(userId));
    return;
  }

  res.json(dbStatus);
});

export default router;
