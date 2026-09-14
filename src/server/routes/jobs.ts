import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb, isDbConnected } from '../db';
import { requireAuth } from '../middleware/auth';
import { JOB_TRANSITIONS } from '../../types';
import type { JobState, JobStateTransition } from '../../types';
import { JOBS, createJob, isJobState, ensureJobIndexes } from '../data/jobs';
import { optionalQueryString } from '../lib/query';

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
    const status = optionalQueryString(req.query.status);
    if (status !== undefined) {
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
    if (outcome.status === 'conflict') {
      // Deliberately generic. A 409 already tells the caller the id is taken;
      // saying "owned by another user" adds nothing they cannot infer and
      // confirms it explicitly. Detail goes to the log, not the response.
      console.warn(`[jobs] id conflict: ${String((req.body ?? {}).id)} requested by uid=${req.user!.uid}`);
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

  /**
   * Moving to QUOTED is the one transition that carries a number: the price the
   * worker is proposing.
   *
   * It is rejected on every other edge rather than ignored. Silently dropping it
   * would let a client believe it had repriced an ACCEPTED job.
   *
   * Whether it is REQUIRED depends on the job, so that check lives further down
   * once the job is loaded - see the customerId note there.
   */
  const rawQuote = (req.body ?? {}).quotedPrice;
  let quotedPrice: number | undefined;

  if (rawQuote !== undefined && next !== 'QUOTED') {
    return res.status(400).json({
      error: 'quoted_price_not_allowed',
      field: 'quotedPrice',
      message: `quotedPrice may only be set when moving to QUOTED, not to ${next}.`,
    });
  }

  if (rawQuote !== undefined) {
    quotedPrice = Number(rawQuote);
    if (!Number.isFinite(quotedPrice) || quotedPrice <= 0) {
      return res.status(400).json({
        error: 'invalid_quoted_price',
        field: 'quotedPrice',
        message: 'quotedPrice must be a positive number.',
      });
    }
  }

  try {
    const db = getDb();
    const uid = req.user!.uid;
    const job = await db.collection(JOBS).findOne({ _id: req.params.id as never, kaarigarId: uid });

    if (!job) {
      return res.status(404).json({ error: 'job_not_found', message: 'No such job for this user.' });
    }

    /**
     * A customer-linked job is ACCEPTED BY THE CUSTOMER, never by the worker.
     *
     * Without this the worker could walk their own job past QUOTED and write an
     * agreement the customer never gave, which would make agreedPrice worthless
     * as evidence and the customer's Accept button decorative.
     *
     * Jobs with no customerId are unaffected: those are the worker's own record
     * of work they did for someone with no account, and there is nobody else to
     * ask. That is the same distinction createJob draws about agreedPrice.
     */
    /**
     * A price is MANDATORY when quoting a customer's request and OPTIONAL on the
     * worker's own job.
     *
     * The customer is shown this number and asked to accept it, so a QUOTED
     * request with no price is a screen they cannot act on - they would be
     * agreeing to a blank. A worker's own job has no counterparty to show it to;
     * QUOTED is just a step on their record, and it moved without a price long
     * before quoting existed. Requiring one there breaks that flow for no gain.
     */
    if (next === 'QUOTED' && job.customerId && quotedPrice === undefined) {
      return res.status(400).json({
        error: 'quoted_price_required',
        field: 'quotedPrice',
        message: 'A customer request needs a price before it can be quoted.',
      });
    }

    if (next === 'ACCEPTED' && job.customerId) {
      return res.status(403).json({
        error: 'customer_accepts_quote',
        message: 'This request was made by a customer, so only they can accept the quote.',
      });
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
    /**
     * Going back to REQUESTED withdraws the quote, so the price goes with it.
     * See the QUOTED note in JOB_TRANSITIONS: a REQUESTED job holding a price
     * nobody stands behind is worse than one holding none, because the checks
     * that protect a blank quote all read as satisfied.
     */
    const updated = await db.collection(JOBS).findOneAndUpdate(
      { _id: req.params.id as never, kaarigarId: uid, status: current },  // guards against a concurrent transition
      {
        $set: { status: next, ...(quotedPrice !== undefined ? { quotedPrice } : {}) },
        ...(next === 'REQUESTED' ? { $unset: { quotedPrice: '' } } : {}),
        $push: { stateHistory: entry as never },
      },
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
