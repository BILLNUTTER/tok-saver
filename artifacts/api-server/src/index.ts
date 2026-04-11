import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable, downloadsTable, subscriptionsTable } from "@workspace/db";
import { eq, and, gt, count } from "drizzle-orm";
import { sendDailyReminderEmail } from "./lib/email";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
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

  startDailyEmailScheduler();
});

// ─── Daily Email Scheduler ───────────────────────────────────────────────────
// Sends reminder emails once per day at 10:00 AM East Africa Time (UTC+3).

let lastDailySentDate = "";

function getTodayEAT(): string {
  return new Date().toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" });
}

function getCurrentHourEAT(): number {
  return Number(
    new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi", hour: "numeric", hour12: false })
  );
}

async function runDailyEmails() {
  logger.info("Running daily email job");
  try {
    const now = new Date();
    const freeLimit = 1;

    // Get all non-suspended users
    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(eq(usersTable.suspended, false));

    logger.info({ count: users.length }, "Sending daily reminders");

    for (const user of users) {
      try {
        // Check active subscription
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

        // Skip if user has an active subscription (they don't need a reminder)
        if (activeSub) continue;

        // Check how many downloads they've used
        const [dlResult] = await db
          .select({ count: count() })
          .from(downloadsTable)
          .where(eq(downloadsTable.userId, user.id));

        const usedDownloads = Number(dlResult?.count ?? 0);
        const hasFreeDl = usedDownloads < freeLimit;

        await sendDailyReminderEmail(user.name, user.email, hasFreeDl);
      } catch (userErr) {
        logger.error({ userErr, userId: user.id }, "Error sending reminder to user");
      }
    }

    logger.info("Daily email job complete");
  } catch (err) {
    logger.error({ err }, "Daily email job failed");
  }
}

function startDailyEmailScheduler() {
  // Check every 30 minutes if it's time to send the daily email
  setInterval(async () => {
    const today = getTodayEAT();
    const hour = getCurrentHourEAT();

    // Send at 10am EAT, only once per day
    if (hour === 10 && lastDailySentDate !== today) {
      lastDailySentDate = today;
      await runDailyEmails();
    }
  }, 30 * 60 * 1000); // every 30 minutes

  logger.info("Daily email scheduler started (sends at 10:00 AM EAT)");
}
