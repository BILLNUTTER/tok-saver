import { Router, type IRouter } from "express";
import { db, usersTable, downloadsTable, subscriptionsTable } from "@workspace/db";
import { eq, and, gt, count, sum, gte } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import { AdminUpdateSettingsBody } from "@workspace/api-zod";
import { getSetting, setSetting, getAllSettings } from "../lib/settings";

const router: IRouter = Router();

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const now = new Date();

  const result = await Promise.all(
    users.map(async (user) => {
      const [dlResult] = await db
        .select({ count: count() })
        .from(downloadsTable)
        .where(eq(downloadsTable.userId, user.id));

      const [activeSub] = await db
        .select()
        .from(subscriptionsTable)
        .where(
          and(
            eq(subscriptionsTable.userId, user.id),
            eq(subscriptionsTable.status, "active"),
            gt(subscriptionsTable.expiresAt, now)
          )
        );

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        createdAt: user.createdAt,
        downloadsCount: Number(dlResult?.count ?? 0),
        subscriptionStatus: activeSub?.status ?? null,
        subscriptionExpiresAt: activeSub?.expiresAt ?? null,
      };
    })
  );

  res.json(result);
});

router.get("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const settings = await getAllSettings();
  res.json({
    subscriptionPrice: Number(settings.subscription_price ?? 49),
    currency: settings.currency ?? "KES",
    paylorApiKey: settings.paylor_api_key ?? "",
    paylorApiUrl: settings.paylor_api_url ?? "https://paylor.webnixke.com/",
    paylorChannelId: settings.paylor_channel_id ?? "",
    adminKey: settings.admin_key ?? "",
    freeDownloadsPerUser: Number(settings.free_downloads_per_user ?? 1),
  });
});

router.put("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = AdminUpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates = parsed.data;

  if (updates.subscriptionPrice != null) {
    await setSetting("subscription_price", String(updates.subscriptionPrice));
  }
  if (updates.currency != null) {
    await setSetting("currency", updates.currency);
  }
  if (updates.paylorApiKey != null) {
    await setSetting("paylor_api_key", updates.paylorApiKey);
  }
  if (updates.paylorApiUrl != null) {
    await setSetting("paylor_api_url", updates.paylorApiUrl);
  }
  if (updates.paylorChannelId != null) {
    await setSetting("paylor_channel_id", updates.paylorChannelId);
  }
  if (updates.adminKey != null) {
    await setSetting("admin_key", updates.adminKey);
  }
  if (updates.freeDownloadsPerUser != null) {
    await setSetting("free_downloads_per_user", String(updates.freeDownloadsPerUser));
  }

  const settings = await getAllSettings();
  res.json({
    subscriptionPrice: Number(settings.subscription_price ?? 49),
    currency: settings.currency ?? "KES",
    paylorApiKey: settings.paylor_api_key ?? "",
    paylorApiUrl: settings.paylor_api_url ?? "https://paylor.webnixke.com/",
    paylorChannelId: settings.paylor_channel_id ?? "",
    adminKey: settings.admin_key ?? "",
    freeDownloadsPerUser: Number(settings.free_downloads_per_user ?? 1),
  });
});

router.get("/admin/stats", requireAdmin, async (req, res): Promise<void> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalUsersResult] = await db
    .select({ count: count() })
    .from(usersTable);

  const [activeSubsResult] = await db
    .select({ count: count() })
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.status, "active"),
        gt(subscriptionsTable.expiresAt, now)
      )
    );

  const [totalDlResult] = await db
    .select({ count: count() })
    .from(downloadsTable);

  const [revenueResult] = await db
    .select({ total: sum(subscriptionsTable.amountPaid) })
    .from(subscriptionsTable)
    .where(gte(subscriptionsTable.createdAt, startOfMonth));

  const [newUsersResult] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(gte(usersTable.createdAt, startOfMonth));

  res.json({
    totalUsers: Number(totalUsersResult?.count ?? 0),
    activeSubscribers: Number(activeSubsResult?.count ?? 0),
    totalDownloads: Number(totalDlResult?.count ?? 0),
    revenueThisMonth: Number(revenueResult?.total ?? 0),
    newUsersThisMonth: Number(newUsersResult?.count ?? 0),
  });
});

export default router;
