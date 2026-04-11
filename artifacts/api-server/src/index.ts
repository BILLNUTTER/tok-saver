import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable, downloadsTable, subscriptionsTable } from "@workspace/db";
import { eq, and, gt, lt, gte, count } from "drizzle-orm";
import { sendMorningReminderEmail, sendEveningReminderEmail, sendSubscriptionExpiredEmail, warmSmtp } from "./lib/email";
import { initOtpPool } from "./lib/otpPool";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Pre-generate OTP codes and warm the SMTP connection so neither step
  // adds latency when the first user registers or resets their password.
  initOtpPool();
  warmSmtp();

  startEmailScheduler();
});

// ─── Email Scheduler ──────────────────────────────────────────────────────────
// Sends reminders twice a day (8 AM and 8 PM EAT) to non-Pro users.

// Tracks the last date each slot was sent, e.g. { morning: "4/11/2026", evening: "" }
const lastSent: Record<"morning" | "evening", string> = { morning: "", evening: "" };

function todayEAT(): string {
  return new Date().toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" });
}

function hourEAT(): number {
  return Number(
    new Date().toLocaleString("en-KE", {
      timeZone: "Africa/Nairobi",
      hour: "numeric",
      hour12: false,
    })
  );
}

const BATCH_SIZE = 2;
const BATCH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between every 2 emails

async function runReminderBatch(slot: "morning" | "evening"): Promise<void> {
  logger.info({ slot }, "Starting reminder email batch");
  const now = new Date();
  const freeLimit = 1;

  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.suspended, false), eq(usersTable.emailUnsubscribed, false)));

  logger.info({ slot, count: users.length }, "Sending reminder emails");

  let sentCount = 0;

  for (const user of users) {
    try {
      const [activeSub] = await db
        .select({ id: subscriptionsTable.id })
        .from(subscriptionsTable)
        .where(
          and(
            eq(subscriptionsTable.userId, user.id),
            eq(subscriptionsTable.status, "active"),
            gt(subscriptionsTable.expiresAt, now)
          )
        );

      if (activeSub) continue; // Pro users don't need reminders

      const [dlResult] = await db
        .select({ count: count() })
        .from(downloadsTable)
        .where(eq(downloadsTable.userId, user.id));

      const hasFreeDl = Number(dlResult?.count ?? 0) < freeLimit;

      if (slot === "morning") {
        await sendMorningReminderEmail(user.id, user.name, user.email, hasFreeDl);
      } else {
        await sendEveningReminderEmail(user.id, user.name, user.email, hasFreeDl);
      }

      sentCount++;

      // After every BATCH_SIZE emails, wait before sending the next batch
      if (sentCount % BATCH_SIZE === 0) {
        logger.info({ slot, sentCount }, `Batch cooldown: waiting ${BATCH_COOLDOWN_MS / 60000} min`);
        await new Promise((resolve) => setTimeout(resolve, BATCH_COOLDOWN_MS));
      }
    } catch (err) {
      logger.error({ err, userId: user.id, slot }, "Error sending reminder");
    }
  }

  logger.info({ slot, sentCount }, "Reminder batch complete");
}

async function runExpiryBatch(): Promise<void> {
  logger.info("Starting subscription expiry email batch");
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const expiredSubs = await db
    .select({
      userId: subscriptionsTable.userId,
      plan: subscriptionsTable.plan,
      name: usersTable.name,
      email: usersTable.email,
      emailUnsubscribed: usersTable.emailUnsubscribed,
    })
    .from(subscriptionsTable)
    .innerJoin(usersTable, eq(subscriptionsTable.userId, usersTable.id))
    .where(
      and(
        eq(subscriptionsTable.status, "active"),
        lt(subscriptionsTable.expiresAt, now),
        gte(subscriptionsTable.expiresAt, since),
        eq(usersTable.emailUnsubscribed, false)
      )
    );

  logger.info({ count: expiredSubs.length }, "Sending subscription expiry emails");

  for (const sub of expiredSubs) {
    try {
      await sendSubscriptionExpiredEmail(sub.userId, sub.name, sub.email, sub.plan);
    } catch (err) {
      logger.error({ err, userId: sub.userId }, "Error sending expiry email");
    }
  }

  logger.info({ count: expiredSubs.length }, "Expiry email batch complete");
}

function startEmailScheduler() {
  // Check every 10 minutes — fires each slot once per day in their hour window
  setInterval(async () => {
    const today = todayEAT();
    const hour = hourEAT();

    // Morning window: 8 AM EAT
    if (hour === 8 && lastSent.morning !== today) {
      lastSent.morning = today;
      await runReminderBatch("morning");
      await runExpiryBatch();
    }

    // Evening window: 8 PM EAT
    if (hour === 20 && lastSent.evening !== today) {
      lastSent.evening = today;
      await runReminderBatch("evening");
    }
  }, 10 * 60 * 1000); // every 10 minutes

  logger.info("Email scheduler started (8:00 AM and 8:00 PM EAT)");
}
