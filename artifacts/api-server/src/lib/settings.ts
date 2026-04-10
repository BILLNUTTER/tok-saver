import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const STATIC_DEFAULTS: Record<string, string> = {
  subscription_price: "49",
  currency: "KES",
  paylor_api_key: "",
  paylor_api_url: "https://paylor.webnixke.com/",
  paylor_channel_id: "",
  free_downloads_per_user: "1",
};

function getDefaultAdminKey(): string {
  const key = process.env.ADMIN_KEY;
  if (!key) {
    throw new Error("ADMIN_KEY environment variable is required but not set");
  }
  return key;
}

export async function getSetting(key: string): Promise<string> {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key));
  if (row) return row.value;
  if (key === "admin_key") return getDefaultAdminKey();
  return STATIC_DEFAULTS[key] ?? "";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettingsTable);
  const result: Record<string, string> = {
    ...STATIC_DEFAULTS,
    admin_key: getDefaultAdminKey(),
  };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
