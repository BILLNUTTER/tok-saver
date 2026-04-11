import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, downloadsTable, subscriptionsTable } from "@workspace/db";
import { eq, and, gt, count, desc } from "drizzle-orm";
import { signToken } from "../lib/auth";
import { requireAuth } from "../middlewares/requireAuth";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { sendWelcomeEmail, sendResetCodeEmail } from "../lib/email";

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

  // Fire-and-forget: send welcome email without blocking the response
  sendWelcomeEmail(user.name, user.email).catch(() => {});

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

router.get("/user/payments", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const payments = await db
    .select({
      id: subscriptionsTable.id,
      status: subscriptionsTable.status,
      amountPaid: subscriptionsTable.amountPaid,
      currency: subscriptionsTable.currency,
      paymentReference: subscriptionsTable.paymentReference,
      paidAt: subscriptionsTable.createdAt,
      expiresAt: subscriptionsTable.expiresAt,
    })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .orderBy(desc(subscriptionsTable.createdAt));

  res.json(payments.map((p) => ({ ...p, amountPaid: Number(p.amountPaid) })));
});

router.post("/user/change-password", requireAuth, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(usersTable)
    .set({ passwordHash: newHash })
    .where(eq(usersTable.id, req.userId!));

  req.log.info({ userId: req.userId }, "User changed password");
  res.json({ message: "Password changed successfully" });
});

// ─── Password Reset ───────────────────────────────────────────────────────────

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user) {
    // Return success regardless so we don't leak whether an email is registered
    res.json({ message: "If that email is registered, a code has been sent." });
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db
    .update(usersTable)
    .set({ resetCode: code, resetCodeExpiresAt: expiresAt })
    .where(eq(usersTable.id, user.id));

  sendResetCodeEmail(user.name, email, code).catch(() => {});

  res.json({ message: "If that email is registered, a code has been sent." });
});

router.post("/auth/verify-reset-code", async (req, res): Promise<void> => {
  const { email, code } = req.body as { email?: string; code?: string };
  if (!email || !code) {
    res.status(400).json({ error: "Email and code are required" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, resetCode: usersTable.resetCode, resetCodeExpiresAt: usersTable.resetCodeExpiresAt })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user || user.resetCode !== code || !user.resetCodeExpiresAt) {
    res.status(400).json({ error: "The code is incorrect or has expired." });
    return;
  }

  if (new Date() > user.resetCodeExpiresAt) {
    res.status(400).json({ error: "The code has expired. Please request a new one." });
    return;
  }

  res.json({ message: "Code verified" });
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { email, code, newPassword } = req.body as {
    email?: string;
    code?: string;
    newPassword?: string;
  };

  if (!email || !code || !newPassword) {
    res.status(400).json({ error: "Email, code, and new password are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, resetCode: usersTable.resetCode, resetCodeExpiresAt: usersTable.resetCodeExpiresAt })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user || user.resetCode !== code || !user.resetCodeExpiresAt) {
    res.status(400).json({ error: "The code is incorrect or has expired." });
    return;
  }

  if (new Date() > user.resetCodeExpiresAt) {
    res.status(400).json({ error: "The code has expired. Please request a new one." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(usersTable)
    .set({ passwordHash, resetCode: null, resetCodeExpiresAt: null, tokensRevokedBefore: new Date() })
    .where(eq(usersTable.id, user.id));

  req.log.info({ userId: user.id }, "Password reset via OTP");
  res.json({ message: "Password reset successfully" });
});

export default router;
