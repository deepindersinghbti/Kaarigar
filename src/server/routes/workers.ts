import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected } from '../db';
import { bookingsEnabled } from '../bookingConfig';
import { findOwnerIdByHandle } from '../data/profiles';
import { statsFor } from '../data/reliability';

/**
 * GET /api/workers/:handle/stats - the public reliability figures.
 *
 * Owner: Track A. Mounted at /api/workers, UNAUTHENTICATED, because this backs
 * the same public surface as /p/:handle and the QR code on a worker's card. A
 * customer deciding whether to trust someone must be able to see this before
 * they have an account.
 *
 * KEYED BY passportHandle, NOT BY USER ID. §4 of the brief wrote
 * /api/workers/:id/stats; this codebase has never put a user id in a public URL
 * and should not start. The handle is the published identifier - it is what
 * /p/:handle uses and what GET /api/kaarigars returns - and resolving it here
 * through findOwnerIdByHandle keeps the uid server-side where it belongs.
 *
 * WHAT IS SAFE TO PUBLISH HERE. WorkerStats carries no PII: counts, ratios and
 * a rating average. It is NOT a widening of PUBLIC_PROJECTION in data/profiles
 * and must never become one - if a field that identifies or contacts a worker
 * is ever wanted on this response, it belongs in that allowlist, reviewed on
 * its own terms.
 */

export const workersRouter = Router();

function dbGuard(res: Response): boolean {
  if (isDbConnected()) return true;
  res.status(503).json({
    error: 'database_unavailable',
    message: 'Check MONGODB_URI and the Atlas Network Access allowlist.',
  });
  return false;
}

workersRouter.get('/:handle/stats', async (req: Request, res: Response) => {
  /**
   * With the flag off there is no ledger to report, so this endpoint does not
   * exist - 404, the same answer an unbuilt path gives. Publishing a
   * zero-filled WorkerStats instead would put "0 on-time visits" on a public
   * page about a real person, which is the "new joiner starts at zero" lie the
   * whole scoring design exists to avoid, told about every worker at once.
   */
  if (!bookingsEnabled()) {
    return res.status(404).json({ error: 'not_found', message: 'No handler for this path.' });
  }
  if (!dbGuard(res)) return;

  const handle = String(req.params.handle ?? '').trim();
  if (!handle) {
    return res.status(400).json({ error: 'invalid_handle', message: 'A passport handle is required.' });
  }

  try {
    const uid = await findOwnerIdByHandle(handle);
    if (!uid) {
      return res.status(404).json({ error: 'kaarigar_not_found', message: `No kaarigar with passport handle "${handle}".` });
    }

    return res.json({ stats: await statsFor(uid) });
  } catch (err) {
    console.error('[workers] GET /:handle/stats failed:', err);
    return res.status(500).json({ error: 'stats_read_failed', message: 'Could not load the reliability record.' });
  }
});
