import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb, isDbConnected } from '../db';
import { requireAuth } from '../middleware/auth';
import { JOB_TRANSITIONS } from '../../types';
import type { JobState, JobStateTransition } from '../../types';
import { JOBS, createJob, isJobState, ensureJobIndexes } from '../data/jobs';

/**
 * jobs-svc - job lifecycle state machine.
 *
 * Owner: Track A. Mounted at /api/jobs.
 *
 * Every query is scoped by kaarigarId = req.user.uid. Ownership is expressed as
 * part of the filter rather than as a check after loading, so there is no path
 * where a job is fetched and then found to belong to someone else.
 */

export const jobsRouter = Router();

function dbGuard(res: Response): boolean {
  if (isDbConnected()) return true;
  res.status(503).json({
    error: 'database_unavailable',
    message: 'Check MONGODB_URI and the Atlas Network Access allowlist.',
  });
  return false;
}

/** GET /api/jobs - the caller's jobs, newest first. */
jobsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    await ensureJobIndexes();
    const db = getDb();

    const filter: Record<string, unknown> = { kaarigarId: req.user!.uid };
    const status = req.query.status;
    if (typeof status === 'string') {
      if (!isJobState(status)) {
        return res.status(400).json({
          error: 'invalid_status',
          message: `status must be one of: ${Object.keys(JOB_TRANSITIONS).join(', ')}.`,
        });
      }
      filter.status = status;
    }

    const docs = await db.collection(JOBS).find(filter).sort({ date: -1, _id: -1 }).toArray();
    return res.json({
      jobs: docs.map(({ _id, ...j }) => ({ ...j, id: String(_id) })),
    });
  } catch (err) {
    console.error('[jobs] GET / failed:', err);
    return res.status(500).json({ error: 'jobs_read_failed', message: 'Could not load jobs.' });
  }
});

/**
 * POST /api/jobs
 *
 * Idempotent on the client-generated UUIDv7. The same id posted twice returns
 * the existing job rather than creating a duplicate - the offline outbox
 * replays on reconnect, and a flaky connection that half-uploads a batch must
 * not produce two jobs.
 */
jobsRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    const outcome = await createJob(req.user!.uid, req.body);

    if (outcome.status === 'rejected') {
      return res.status(400).json({ error: 'invalid_field', field: outcome.field, message: outcome.message });
    }
    if (outcome.status === 'duplicate') {
      return res.status(200).json({ job: outcome.job, idempotentReplay: true });
    }
    return res.status(201).json({ job: outcome.job });
  } catch (err) {
    console.error('[jobs] POST / failed:', err);
    return res.status(500).json({ error: 'job_create_failed', message: 'Could not create the job.' });
  }
});

/**
 * POST /api/jobs/:id/transition
 *
 * The state machine is enforced HERE, against JOB_TRANSITIONS, not in the
 * client. An illegal jump is rejected rather than trusted - otherwise
 * "COMPLETED" could be set directly and the portfolio evidence a passport
 * rests on would be self-asserted.
 *
 * DISPUTED has no inbound edge in the locked scope, so this endpoint cannot
 * reach it. That is the table doing its job, not an oversight.
 */
jobsRouter.post('/:id/transition', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const next = (req.body ?? {}).state;
  if (!isJobState(next)) {
    return res.status(400).json({
      error: 'invalid_state',
      message: `state must be one of: ${Object.keys(JOB_TRANSITIONS).join(', ')}.`,
    });
  }

  try {
    const db = getDb();
    const uid = req.user!.uid;
    const job = await db.collection(JOBS).findOne({ _id: req.params.id as never, kaarigarId: uid });

    if (!job) {
      return res.status(404).json({ error: 'job_not_found', message: 'No such job for this user.' });
    }

    const current = job.status as JobState;
    const allowed = JOB_TRANSITIONS[current];

    if (!allowed.includes(next)) {
      return res.status(409).json({
        error: 'illegal_transition',
        message: `Cannot move from ${current} to ${next}.`,
        from: current,
        attempted: next,
        allowed,
      });
    }

    const entry: JobStateTransition = { state: next, at: new Date().toISOString(), by: uid };
    const updated = await db.collection(JOBS).findOneAndUpdate(
      { _id: req.params.id as never, kaarigarId: uid, status: current },  // guards against a concurrent transition
      { $set: { status: next }, $push: { stateHistory: entry as never } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(409).json({
        error: 'concurrent_transition',
        message: 'The job changed state during this request. Re-read and retry.',
      });
    }

    const { _id, ...j } = updated;
    return res.json({ job: { ...j, id: String(_id) } });
  } catch (err) {
    console.error('[jobs] POST /:id/transition failed:', err);
    return res.status(500).json({ error: 'transition_failed', message: 'Could not transition the job.' });
  }
});
