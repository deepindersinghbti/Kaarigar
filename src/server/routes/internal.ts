import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { isDbConnected } from '../db';
import { bookingsEnabled, nowMs } from '../bookingConfig';
import { applyOverdue } from '../bookings/transitions';

/**
 * POST /api/internal/sweep - apply every overdue booking deadline.
 *
 * Owner: Track A. Mounted at /api/internal, with NO requireAuth: the caller is
 * an external cron job, not a user. See docs/SWEEPER.md for the setup.
 *
 * WHY THIS EXISTS AT ALL. Deadlines are data, not timers - Render's free plan
 * spins the container down, and a setTimeout holding a deadline dies with it.
 * Most deadlines are applied on read: any list or transition touching a
 * booking runs its overdue rules first. The sweeper covers the rest - bookings
 * NOBODY reads. A kaarigar who never opens the app again would otherwise never
 * be marked NO_SHOW, because the only code that could mark them is code that
 * never runs.
 *
 * THE SECRET IS THE ONLY GATE, so four rules about it:
 *
 * 1. A WRONG OR MISSING SECRET IS INDISTINGUISHABLE FROM A ROUTE THAT DOES NOT
 *    EXIST. Not 401, not 403 - the handler calls next() and the request falls
 *    through to the ordinary /api JSON 404 in routes/index.ts. The response is
 *    that handler's own output, byte for byte, so nothing about it can drift
 *    into revealing that this path is real.
 *
 * 2. AN UNCONFIGURED SERVER NEVER SWEEPS. SWEEP_SECRET unset, or shorter than 32
 *    characters, and every request is a 404. Failing closed matters because the
 *    header comparison with an empty expected value would otherwise be one
 *    empty header away from success.
 *
 * 3. CONSTANT-TIME COMPARISON. Nobody is timing this over Render's proxy in
 *    practice, but timingSafeEqual costs nothing and removes the question.
 *
 * 4. THE SECRET IS CHECKED BEFORE ANYTHING ELSE. Before the database check, so a
 *    503 "database not ready" is only ever shown to a caller who proved they
 *    hold the secret - it would otherwise confirm the endpoint exists to anyone.
 *
 * AFTER THE SECRET:
 *   - database not connected -> 503, the same body every other route uses. A
 *     cold Render instance takes ~50s to reach Atlas, and the person reading the
 *     cron log must be able to tell "not ready yet" from "wrong secret".
 *   - BOOKINGS_ENABLED off   -> 200 { enabled: false }, sweeping nothing. The
 *     caller has already proved they are the operator, so there is nothing to
 *     hide from them, and a cron job left running while the feature is paused
 *     should show green with a reason rather than a 404 that looks like a
 *     misconfiguration.
 *
 * Idempotent by construction: every rule is a conditional update naming the
 * expected status, and the ledger's unique { bookingId, type } index absorbs a
 * duplicate event. Two overlapping sweeps, or a sweep racing a read, cannot
 * double-apply anything - a second call in a row returns all zeros.
 */

export const internalRouter = Router();

const MIN_SECRET_LENGTH = 32;
let warnedUnconfigured = false;

/** True only for a configured secret that the request's header matches exactly. */
function secretMatches(req: Request): boolean {
  const expected = process.env.SWEEP_SECRET ?? '';
  if (expected.length < MIN_SECRET_LENGTH) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        `[sweep] SWEEP_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters - ` +
        '/api/internal/sweep will answer 404 to every request. See docs/SWEEPER.md.'
      );
    }
    return false;
  }

  const provided = req.header('x-sweep-secret') ?? '';
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on unequal lengths. A length mismatch is simply
  // "wrong", and returning early on it discloses only the length, which a
  // 32+ character random secret does not need to hide.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

internalRouter.post('/sweep', async (req: Request, res: Response, next: NextFunction) => {
  // Rule 1: fall through to the real /api 404, so the response is identical to
  // any path that was never built.
  if (!secretMatches(req)) return next();

  res.set('Cache-Control', 'no-store');

  if (!isDbConnected()) {
    return res.status(503).json({
      error: 'database_unavailable',
      message: 'Check MONGODB_URI and the Atlas Network Access allowlist.',
    });
  }

  if (!bookingsEnabled()) {
    return res.json({
      enabled: false,
      message: 'BOOKINGS_ENABLED is off, so there is nothing to sweep.',
    });
  }

  const startedAt = nowMs();
  try {
    const counts = await applyOverdue({}, startedAt);
    const durationMs = nowMs() - startedAt;

    /**
     * One log line per sweep that did something, and silence otherwise. At a
     * ten-minute cadence an unconditional line is 144 entries a day saying
     * nothing, which is how the one that matters gets scrolled past.
     */
    const moved = counts.rescheduleAutoRejected + counts.expired + counts.scheduleExpired + counts.late + counts.noShow;
    if (moved > 0) {
      console.log(`[sweep] ${JSON.stringify(counts)} in ${durationMs}ms`);
    }

    return res.json({
      enabled: true,
      // The brief's three headline counts, first and flat, for the cron log...
      expired: counts.expired,
      late: counts.late,
      noShow: counts.noShow,
      // ...and the two rules added after it, reported rather than folded in:
      // an unanswered request and an agreed job left unscheduled are different
      // failures and write different events, so one number would hide which.
      scheduleExpired: counts.scheduleExpired,
      rescheduleAutoRejected: counts.rescheduleAutoRejected,
      ranAt: new Date(startedAt).toISOString(),
      durationMs,
    });
  } catch (err) {
    console.error('[sweep] failed:', err);
    return res.status(500).json({ error: 'sweep_failed', message: 'The sweep did not complete. It is safe to run again.' });
  }
});
