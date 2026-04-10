import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, downloadsTable, subscriptionsTable } from "@workspace/db";
import { eq, and, gt, count } from "drizzle-orm";
import { signToken } from "../lib/auth";
import { requireAuth } from "../middlewares/requireAuth";
import { RegisterBody, LoginBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, email, phone, password } = parsed.data;

  const [existingEmail] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (existingEmail) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const [existingPhone] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.phone, phone));
  if (existingPhone) {
    res.status(409).json({ error: "Phone number already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(usersTable)
    .values({ name, email, phone, passwordHash })
    .returning();

  const token = signToken({ userId: user.id, email: user.email });

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      createdAt: user.createdAt,
      downloadsCount: 0,
      hasActiveSubscription: false,
    },
    token,
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const [downloadsResult] = await db
    .select({ count: count() })
    .from(downloadsTable)
    .where(eq(downloadsTable.userId, user.id));

  const now = new Date();
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

  const token = signToken({ userId: user.id, email: user.email });

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      createdAt: user.createdAt,
      downloadsCount: Number(downloadsResult?.count ?? 0),
      hasActiveSubscription: !!activeSub,
    },
    token,
  });
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  // Revoke all tokens for this user issued before now.
  // Any JWT with iat < tokensRevokedBefore will be rejected by requireAuth.
  await db
    .update(usersTable)
    .set({ tokensRevokedBefore: new Date() })
    .where(eq(usersTable.id, req.userId!));

  res.json({ message: "Logged out successfully" });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [downloadsResult] = await db
    .select({ count: count() })
    .from(downloadsTable)
    .where(eq(downloadsTable.userId, user.id));

  const now = new Date();
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

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt,
    downloadsCount: Number(downloadsResult?.count ?? 0),
    hasActiveSubscription: !!activeSub,
  });
});

export default router;
