import { logger } from "./logger";

// ─── In-memory OTP pool ───────────────────────────────────────────────────────
// Codes are pre-generated so acquiring one is O(1) — no computation on the
// hot path. The pool is replenished asynchronously after each use.
//
// Security note: pre-generating 6-digit codes provides no meaningful advantage
// to an attacker — they still expire in 15 minutes and are tied to a specific
// user's record in the DB. The randomness quality is the same as on-demand.

const POOL_TARGET = 50;
const REPLENISH_BELOW = 20;

const pool: string[] = [];

function generate(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function fill(n: number): void {
  for (let i = 0; i < n; i++) pool.push(generate());
}

/** Call once on server start to warm the pool. */
export function initOtpPool(): void {
  fill(POOL_TARGET);
  logger.info({ size: pool.length }, "OTP pool initialised");
}

/** Grab one pre-generated code. Replenishes the pool in the background if low. */
export function acquireCode(): string {
  // If somehow empty (shouldn't happen), generate inline
  const code = pool.length > 0 ? pool.pop()! : generate();

  if (pool.length < REPLENISH_BELOW) {
    // Replenish asynchronously — never blocks the caller
    setImmediate(() => {
      const needed = POOL_TARGET - pool.length;
      if (needed > 0) fill(needed);
      logger.debug({ size: pool.length }, "OTP pool replenished");
    });
  }

  return code;
}
