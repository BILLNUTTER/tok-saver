import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userEmail?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, tokensRevokedBefore: usersTable.tokensRevokedBefore })
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // Check if this token was issued before the user's last logout.
  // tokensRevokedBefore is set to NOW() on logout, invalidating all earlier tokens.
  if (user.tokensRevokedBefore && payload.iat !== undefined) {
    // JWT iat is in whole seconds; tokensRevokedBefore has millisecond precision.
    // Use <= so that tokens issued in the same second as the logout are also blocked.
    const revokedBeforeUnix = Math.floor(user.tokensRevokedBefore.getTime() / 1000);
    if (payload.iat <= revokedBeforeUnix) {
      res.status(401).json({ error: "Token has been revoked. Please log in again." });
      return;
    }
  }

  req.userId = user.id;
  req.userEmail = user.email;
  next();
}
