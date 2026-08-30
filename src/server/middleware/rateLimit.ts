import type { Request, Response, NextFunction } from 'express';

/**
 * In-memory fixed-window rate limiter.
 *
 * Architecture section 5 Tier 2 specifies a Redis token bucket. Redis is cut
 * from the locked scope, so this is the same guard in process memory: correct
 * for the single-container deployment we actually ship, and it would need
 * replacing before horizontal scaling because each instance would keep its own
 * counters.
 *
 * KEYED ON BOTH uid AND IP, and the stricter of the two wins. Neither alone is
 * enough:
 *   - uid alone: one leaked token is unlimited.
 *   - IP alone: punishes shared connections, which matters for this user base -
 *     a worksite or a family sharing one mobile connection is normal, not
 *     suspicious.
 *
 * Owner: Track A.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

/**
 * Sweep expired windows so the map cannot grow without bound. Unref'd - it must
 * never hold the process open on its own.
 */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
sweeper.unref?.();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Prefix so different endpoints do not share counters. */
  name: string;
}

function hit(key: string, windowMs: number, max: number): { allowed: boolean; retryAfterSec: number; remaining: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0, remaining: max - 1 };
  }

  existing.count += 1;
  const remaining = Math.max(0, max - existing.count);
  return {
    allowed: existing.count <= max,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    remaining,
  };
}

export function rateLimit({ windowMs, max, name }: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    // req.ip honours trust proxy; fall back so a missing value cannot collapse
    // every caller into one shared bucket.
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const uid = req.user?.uid;

    const checks = [hit(`${name}:ip:${ip}`, windowMs, max)];
    if (uid) checks.push(hit(`${name}:uid:${uid}`, windowMs, max));

    // Both counters are always incremented before deciding, so a caller cannot
    // avoid one bucket by tripping the other first.
    const blocked = checks.find((c) => !c.allowed);
    if (blocked) {
      res.setHeader('Retry-After', String(blocked.retryAfterSec));
      return res.status(429).json({
        error: 'rate_limited',
        message: `Too many requests. Try again in ${blocked.retryAfterSec}s.`,
        retryAfterSeconds: blocked.retryAfterSec,
      });
    }

    res.setHeader('X-RateLimit-Remaining', String(Math.min(...checks.map((c) => c.remaining))));
    return next();
  };
}

/** Test seam - lets a suite reset counters between cases. */
export function __resetRateLimits() {
  buckets.clear();
}
