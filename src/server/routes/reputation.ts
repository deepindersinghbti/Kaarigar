import { Router } from 'express';
import type { Request, Response } from 'express';

import { isDbConnected } from '../db';
import { requireAuth } from '../middleware/auth';
import { findJobForReview } from '../data/jobs';
import { createReview, findReviewByJob } from '../data/reviews';
import { mintReviewToken, verifyReviewToken } from '../lib/reviewToken';
import { resolveOrigin } from '../lib/origin';

/**
 * reputation-svc - job-anchored reviews.
 *
 * Owner: Track C. Mounted at /api/reviews.
 *
 * Surface:
 *   POST /api/reviews         submit a review, authorised by a signed link
 *   POST /api/reviews/link    mint that link (authenticated, owner-scoped)
 *
 * The server-rendered customer-facing form lives in routes/public.ts at
 * /r/:token and shares every rule below through data/reviews.ts, so the two
 * entry points cannot drift.
 */

export const reputationRouter = Router();

function dbGuard(res: Response): boolean {
  if (isDbConnected()) return true;
  res.status(503).json({
    error: 'database_unavailable',
    message: 'Reviews require the database. Check MONGODB_URI and the Atlas allowlist.',
  });
  return false;
}

/**
 * Validate a token all the way to a reviewable job.
 *
 * Shared by the JSON endpoint and the SSR form. Returns a discriminated result
 * rather than writing a response, because the two callers render completely
 * differently - one JSON, one HTML - and a helper that wrote the response would
 * force one of them to speak the other's format.
 */
export type ReviewGate =
  | { ok: true; job: NonNullable<Awaited<ReturnType<typeof findJobForReview>>> }
  | { ok: false; status: number; code: string; message: string };

export async function gateReviewToken(token: string): Promise<ReviewGate> {
  const verdict = verifyReviewToken(token);
  if (!verdict.ok) {
    // One message for every token failure. Distinguishing "bad signature" from
    // "no such job" would turn this into an oracle for which job ids exist.
    const message =
      verdict.reason === 'expired'
        ? 'This review link has expired. Ask for a new one.'
        : 'This review link is not valid.';
    return { ok: false, status: 400, code: `token_${verdict.reason}`, message };
  }

  const job = await findJobForReview(verdict.jobId);
  if (!job) {
    return { ok: false, status: 404, code: 'job_not_found', message: 'This review link is not valid.' };
  }
  if (!job.reviewable) {
    return {
      ok: false,
      status: 409,
      code: 'job_not_reviewable',
      message: 'This job is not finished yet, so it cannot be reviewed.',
    };
  }

  const existing = await findReviewByJob(job.id);
  if (existing) {
    return {
      ok: false,
      status: 409,
      code: 'already_reviewed',
      message: 'This job has already been reviewed. Thank you.',
    };
  }

  return { ok: true, job };
}

/**
 * POST /api/reviews
 *
 * Body: { token, ratings: { workmanship, punctuality, priceHonesty, cleanliness }, text? }
 *
 * NO requireAuth, deliberately. The reviewer is a customer with no account -
 * the locked scope has them reach the worker by QR rather than by signing up -
 * so the signed job-bound token IS the credential. See lib/reviewToken.ts for
 * what that does and does not guarantee.
 */
reputationRouter.post('/', async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const token = String(req.body?.token ?? '').trim();
  if (!token) {
    return res.status(400).json({ error: 'invalid_request', field: 'token', message: 'token is required.' });
  }

  try {
    const gate = await gateReviewToken(token);
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.code, message: gate.message });
    }

    const outcome = await createReview({
      jobId: gate.job.id,
      subjectId: gate.job.kaarigarId,
      ratings: req.body?.ratings,
      text: req.body?.text,
    });

    if (outcome.status === 'rejected') {
      return res.status(400).json({ error: 'invalid_rating', field: outcome.field, message: outcome.message });
    }
    if (outcome.status === 'already_reviewed') {
      return res.status(409).json({ error: 'already_reviewed', message: 'This job has already been reviewed.' });
    }

    return res.status(201).json({ review: outcome.review });
  } catch (err) {
    console.error('[reputation] POST / failed:', err);
    return res.status(500).json({ error: 'review_failed', message: 'Could not save the review.' });
  }
});

/**
 * POST /api/reviews/link  { jobId }
 *
 * Mints the link the worker sends to their customer.
 *
 * OWNER-SCOPED, and this is the check that matters in the whole flow. Anyone
 * who can mint a link for a job they do not own can review any worker they
 * like. Ownership is compared against the job's kaarigarId, and a job belonging
 * to someone else answers 404 rather than 403 - consistent with every other
 * read in this codebase, so that a probe cannot learn which job ids exist.
 */
reputationRouter.post('/link', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const jobId = String(req.body?.jobId ?? '').trim();
  if (!jobId) {
    return res.status(400).json({ error: 'invalid_request', field: 'jobId', message: 'jobId is required.' });
  }

  try {
    const job = await findJobForReview(jobId);
    if (!job || job.kaarigarId !== req.user!.uid) {
      return res.status(404).json({ error: 'job_not_found', message: 'No such job.' });
    }
    if (!job.reviewable) {
      return res.status(409).json({
        error: 'job_not_reviewable',
        message: `A job can be reviewed once it is COMPLETED or SETTLED. This one is ${job.status}.`,
      });
    }
    if (await findReviewByJob(job.id)) {
      return res.status(409).json({ error: 'already_reviewed', message: 'This job has already been reviewed.' });
    }

    const token = mintReviewToken(job.id);
    return res.status(201).json({ url: `${resolveOrigin(req)}/r/${token}`, jobId: job.id });
  } catch (err) {
    console.error('[reputation] POST /link failed:', err);
    return res.status(500).json({ error: 'link_failed', message: 'Could not create a review link.' });
  }
});
