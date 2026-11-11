import { db } from "@/lib/db";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 15;

/** Atomic Postgres fixed-window limiter shared by Vercel instances. */
export async function rateLimit(identifier: string): Promise<{ success: boolean; retryAfter?: number }> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
  const key = identifier.slice(0, 180) || "unknown";
  const counter = await db.rateLimitCounter.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1, expiresAt: new Date(windowStart.getTime() + WINDOW_MS * 2) },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  // Opportunistic cleanup keeps the counters table bounded without a new worker.
  if (counter.count === 1 && now.getMinutes() % 10 === 0) {
    await db.rateLimitCounter.deleteMany({ where: { expiresAt: { lt: now } } });
  }

  if (counter.count <= MAX_REQUESTS) return { success: true };
  return {
    success: false,
    retryAfter: Math.max(1, Math.ceil((windowStart.getTime() + WINDOW_MS - now.getTime()) / 1000)),
  };
}
