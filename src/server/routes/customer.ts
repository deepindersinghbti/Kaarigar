import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb, isDbConnected } from '../db';
import { requireAuth } from '../middleware/auth';
import { JOBS, createJob, ensureJobIndexes } from '../data/jobs';
import { listPublicProfiles, findOwnerIdByHandle } from '../data/profiles';
import { optionalQueryString, queryString } from '../lib/query';

/**
 * The customer side of the marketplace: browse kaarigars, request a job, watch
 * the request.
 *
 * Owner: Track A. Mounted at /api/kaarigars and /api/customer.
 *
 * WHY THIS IS A SEPARATE MODULE FROM jobs.ts. POST /api/jobs is a trust
 * boundary with one rule - the owner is req.user.uid and is never read from the
 * body. The customer path needs the opposite: the owner is somebody else, named
 * by the request. Those cannot be the same handler without that handler
 * containing a branch that decides whether to trust the body, and a branch like
 * that is one refactor away from being taken in the wrong case.
 *
 * So POST /api/jobs is left exactly as it was. This is a sibling with its own
 * rule, and the two share the part that must not diverge - validation and the
 * insert - by both calling data/jobs.ts createJob().
 */

export const kaarigarsRouter = Router();
export const customerRouter = Router();

function dbGuard(res: Response): boolean {
  if (isDbConnected()) return true;
  res.status(503).json({
    error: 'database_unavailable',
    message: 'Check MONGODB_URI and the Atlas Network Access allowlist.',
  });
  return false;
}

/**
 * GET /api/kaarigars[?trade=Plumber]
 *
 * The directory a customer browses. Authenticated, because browsing the worker
 * directory is a product surface rather than a public one - /p/:handle already
 * exists for the public, unauthenticated view of a single passport.
 *
 * The response shape is PublicProfile, produced by the SAME PUBLIC_PROJECTION
 * that backs GET /p/:handle. There is no field list in this file, deliberately:
 * see the comment on listPublicProfiles in data/profiles.ts.
 */
kaarigarsRouter.get('/', requireAuth, async (_req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    const trade = optionalQueryString(_req.query.trade);
    const kaarigars = await listPublicProfiles(trade);
    return res.json({ kaarigars });
  } catch (err) {
    console.error('[customer] GET /api/kaarigars failed:', err);
    return res.status(500).json({ error: 'kaarigars_read_failed', message: 'Could not load kaarigars.' });
  }
});

/**
 * POST /api/customer/jobs
 *
 * A customer requesting work from a named kaarigar.
 *
 * WHO OWNS THE NEW JOB IS READ FROM THE REQUEST, which is the one thing
 * POST /api/jobs refuses to do - so the identifier is verified rather than
 * trusted, in two steps:
 *
 *   1. The body names a PASSPORT HANDLE, not a user id. The handle is the only
 *      identifier a customer can hold: PUBLIC_PROJECTION withholds userId from
 *      every public shape on purpose, so the browse list above cannot hand out
 *      a uid and a client has no way to invent one.
 *   2. findOwnerIdByHandle turns it into the owner's uid server-side, and
 *      returns null when no such passport exists. A handle that resolves to
 *      nothing is a 404; nothing is inserted.
 *
 * The uid written to the job is therefore one the server looked up in
 * kaarigar_profiles, never a string the client supplied.
 *
 * customerId and the initial state come from the session and from createJob
 * respectively. Neither is readable from the body.
 */
customerRouter.post('/jobs', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const handle = queryString((req.body ?? {}).kaarigarHandle);
  if (!handle) {
    return res.status(400).json({
      error: 'invalid_field',
      field: 'kaarigarHandle',
      message: 'kaarigarHandle is required - the passport handle of the kaarigar being asked.',
    });
  }

  try {
    const kaarigarUid = await findOwnerIdByHandle(handle);
    if (!kaarigarUid) {
      return res.status(404).json({
        error: 'kaarigar_not_found',
        message: `No kaarigar with passport handle "${handle}".`,
      });
    }

    const uid = req.user!.uid;
    const outcome = await createJob(kaarigarUid, req.body, { actorId: uid, customerId: uid });

    if (outcome.status === 'rejected') {
      return res.status(400).json({ error: 'invalid_field', field: outcome.field, message: outcome.message });
    }
    if (outcome.status === 'conflict') {
      console.warn(`[customer] id conflict: ${String((req.body ?? {}).id)} requested by uid=${uid}`);
      return res.status(409).json({
        error: 'id_conflict',
        message: 'That id is already in use. Generate a new one and retry.',
      });
    }
    if (outcome.status === 'duplicate') {
      return res.status(200).json({ job: outcome.job, idempotentReplay: true });
    }
    return res.status(201).json({ job: outcome.job });
  } catch (err) {
    console.error('[customer] POST /jobs failed:', err);
    return res.status(500).json({ error: 'job_request_failed', message: 'Could not send the request.' });
  }
});

/**
 * GET /api/customer/jobs - the caller's requests, newest first.
 *
 * Scoped by customerId the same way GET /api/jobs is scoped by kaarigarId:
 * ownership is part of the filter, not a check applied to loaded rows, so there
 * is no path where someone else's request is read and then discarded.
 *
 * Same sort as GET /api/jobs - { date: -1, _id: -1 } - so a customer and a
 * kaarigar looking at the same job see it in the same position relative to its
 * neighbours. Two list endpoints over one collection that order differently is
 * a bug report waiting to be filed against the wrong screen.
 */
customerRouter.get('/jobs', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    await ensureJobIndexes();
    const docs = await getDb()
      .collection(JOBS)
      .find({ customerId: req.user!.uid })
      .sort({ date: -1, _id: -1 })
      .toArray();

    return res.json({
      jobs: docs.map(({ _id, ...j }) => ({ ...j, id: String(_id) })),
    });
  } catch (err) {
    console.error('[customer] GET /jobs failed:', err);
    return res.status(500).json({ error: 'customer_jobs_read_failed', message: 'Could not load your requests.' });
  }
});
