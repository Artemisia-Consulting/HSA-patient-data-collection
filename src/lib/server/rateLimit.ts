/**
 * A small fixed-window rate limiter for the two unauthenticated endpoints.
 *
 * Signup and resume are the only routes a stranger can reach, and resume takes
 * a guessable-shaped id, so both need a ceiling. This is deliberately in-memory:
 * the app runs as a single instance behind a ping bot (FR: reliability), and a
 * Redis dependency for ~30 practitioners would be theatre. The trade-off is
 * recorded in docs/streams/backend.md — the counter resets on redeploy and is
 * per-instance, so it is abuse control, not a security boundary.
 *
 * OWNERSHIP: Stream 1 (backend).
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Stop the map growing without bound on a long-lived instance. */
function sweep(now: number): void {
  if (buckets.size < 5_000) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  sweep(now)
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  existing.count += 1
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds }
}

/** Test seam — never called by the app. */
export function resetRateLimits(): void {
  buckets.clear()
}

export const RATE_LIMITS = {
  /** Signup: generous enough for a practice sharing one office IP. */
  signup: { limit: 20, windowMs: 60 * 60 * 1000 },
  /** Resume: caps brute-forcing of reminder link ids. */
  resume: { limit: 30, windowMs: 15 * 60 * 1000 },
  /** Researcher code: a short shared secret, so the tightest ceiling. */
  researcher: { limit: 10, windowMs: 15 * 60 * 1000 },
} as const
