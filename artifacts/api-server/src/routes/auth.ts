import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, downloadsTable, subscriptionsTable } from "@workspace/db";
import { eq, and, gt, count, desc } from "drizzle-orm";
import { signToken } from "../lib/auth";
import { requireAuth } from "../middlewares/requireAuth";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { sendWelcomeEmail, sendResetCodeEmail, sendVerificationCodeEmail, verifyUnsubscribeToken } from "../lib/email";
import { logger } from "../lib/logger";

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

  const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
  const verificationCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const [user] = await db
    .insert(usersTable)
    .values({
      name,
      email,
      phone,
      passwordHash,
      emailVerificationCode: verificationCode,
      emailVerificationCodeExpiresAt: verificationCodeExpiresAt,
    })
    .returning();

  const token = signToken({ userId: user.id, email: user.email });

  // Only send the verification code — welcome email fires after they verify.
  // Sending two emails simultaneously on registration caused SMTP contention.
  sendVerificationCodeEmail(user.name, user.email, verificationCode).catch((e) =>
    logger.error({ err: e }, "Failed to send verification code email")
  );

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      createdAt: user.createdAt,
      downloadsCount: 0,
      hasActiveSubscription: false,
      emailVerified: false,
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
      emailVerified: user.emailVerified,
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
    emailVerified: user.emailVerified,
  });
});

router.post("/auth/verify-email", requireAuth, async (req, res): Promise<void> => {
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Verification code is required" });
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

  if (user.emailVerified) {
    res.json({ message: "Email already verified" });
    return;
  }

  if (
    !user.emailVerificationCode ||
    !user.emailVerificationCodeExpiresAt ||
    user.emailVerificationCode !== code.trim() ||
    new Date() > user.emailVerificationCodeExpiresAt
  ) {
    res.status(400).json({ error: "Invalid or expired verification code" });
    return;
  }

  await db
    .update(usersTable)
    .set({
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationCodeExpiresAt: null,
    })
    .where(eq(usersTable.id, user.id));

  logger.info({ userId: user.id }, "Email verified");

  // Now that they're verified, send the welcome email
  sendWelcomeEmail(user.name, user.email).catch((e) =>
    logger.error({ err: e }, "Failed to send welcome email post-verification")
  );

  res.json({ message: "Email verified successfully" });
});

router.post("/auth/resend-verification", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.emailVerified) {
    res.status(400).json({ error: "Email is already verified" });
    return;
  }

  const newCode = String(Math.floor(100000 + Math.random() * 900000));
  const newExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db
    .update(usersTable)
    .set({
      emailVerificationCode: newCode,
      emailVerificationCodeExpiresAt: newExpiresAt,
    })
    .where(eq(usersTable.id, user.id));

  sendVerificationCodeEmail(user.name, user.email, newCode).catch((e) =>
    logger.error({ err: e }, "Failed to resend verification code email")
  );

  logger.info({ userId: user.id }, "Verification code resent");
  res.json({ message: "Verification code resent" });
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

// ─── Email Unsubscribe ────────────────────────────────────────────────────────

router.get("/auth/unsubscribe", async (req, res): Promise<void> => {
  const uid = Number(req.query["uid"]);
  const token = String(req.query["token"] ?? "");

  if (!uid || isNaN(uid) || !token) {
    res.status(400).send(unsubscribePage("Invalid Link", "This unsubscribe link is invalid or missing required information.", false));
    return;
  }

  if (!verifyUnsubscribeToken(uid, token)) {
    res.status(403).send(unsubscribePage("Invalid Link", "This unsubscribe link is not valid.", false));
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, emailUnsubscribed: usersTable.emailUnsubscribed })
    .from(usersTable)
    .where(eq(usersTable.id, uid));

  if (!user) {
    res.status(404).send(unsubscribePage("Not Found", "We couldn't find your account.", false));
    return;
  }

  if (user.emailUnsubscribed) {
    res.send(unsubscribePage("Already Unsubscribed", "You're already unsubscribed from reminder emails.", true));
    return;
  }

  await db
    .update(usersTable)
    .set({ emailUnsubscribed: true })
    .where(eq(usersTable.id, uid));

  res.send(unsubscribePage("Unsubscribed", "You've been successfully removed from reminder emails. You'll still receive important account emails such as password resets.", true));
});

function unsubscribePage(title: string, message: string, success: boolean): string {
  const color = success ? "#22c55e" : "#ef4444";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — TokSaver</title>
  <style>
    body { margin:0; padding:0; background:#0a0a0a; font-family:'Helvetica Neue',Arial,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { background:#111; border-radius:16px; padding:48px 40px; max-width:420px; text-align:center; border:1px solid #222; }
    .logo { font-size:24px; font-weight:900; color:#fff; margin-bottom:32px; }
    .logo span { color:#FF1A81; }
    .icon { font-size:48px; margin-bottom:16px; }
    h1 { color:#fff; font-size:22px; margin:0 0 12px; }
    p { color:#999; font-size:14px; line-height:1.6; margin:0 0 24px; }
    a { color:#FF1A81; text-decoration:none; font-size:14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo"><span>Tok</span>Saver</div>
    <div class="icon" style="color:${color}">${success ? "✓" : "✗"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://tok-saver.vercel.app">← Back to TokSaver</a>
  </div>
</body>
</html>`;
}

// ─── Password Reset ───────────────────────────────────────────────────────────

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email, phone } = req.body as { email?: string; phone?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  if (!phone || typeof phone !== "string") {
    res.status(400).json({ error: "Phone number is required" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user) {
    res.status(404).json({ error: "No account found with that email address." });
    return;
  }

  // Normalise both phone numbers to digits only for comparison
  const normalise = (p: string) => p.replace(/\D/g, "");
  if (normalise(user.phone) !== normalise(phone)) {
    res.status(400).json({ error: "The phone number does not match our records." });
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db
    .update(usersTable)
    .set({ resetCode: code, resetCodeExpiresAt: expiresAt })
    .where(eq(usersTable.id, user.id));

  sendResetCodeEmail(user.name, email, code).catch((e) => logger.error({ err: e }, "Failed to send reset code email"));

  res.json({ message: "Verification code sent to your email." });
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
