import { getDb } from '../db';
import { uuidv7 } from '../../lib/ids';
import type { Review, ReviewRatings } from '../../types';

/**
 * Data access for reviews.
 *
 * Owner: Track C. reputation-svc owns this collection; both the JSON endpoint
 * and the server-rendered form reach it only through here, so the rules below
 * are enforced once rather than twice with a drift between them.
 */

export const REVIEWS = 'reviews';

const AXES = ['workmanship', 'punctuality', 'priceHonesty', 'cleanliness'] as const;
type Axis = (typeof AXES)[number];

let indexesReady = false;
async function ensureIndexes() {
  if (indexesReady) return;
  // UNIQUE ON jobId. This is what makes a review link single-use, and it is an
  // index rather than a check because two concurrent submissions would both
  // pass a check. Section 7 specifies it for the same reason: one review per
  // job is the constraint that makes the review job-anchored.
  await getDb().collection(REVIEWS).createIndex({ jobId: 1 }, { unique: true });
  await getDb().collection(REVIEWS).createIndex({ subjectId: 1, createdAt: -1 });
  indexesReady = true;
}

export type CreateReviewOutcome =
  | { status: 'created'; review: Review }
  | { status: 'already_reviewed' }
  | { status: 'rejected'; field: string; message: string };

/**
 * Parse and bounds-check the four rating axes.
 *
 * Section 4D is explicit that a composite hides useful information, so all four
 * are required - accepting a partial rating and defaulting the rest would
 * invent data the customer did not give, and it would be indistinguishable from
 * data they did.
 */
function parseRatings(input: unknown): { ok: true; ratings: ReviewRatings } | { ok: false; field: string; message: string } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const out = {} as ReviewRatings;

  for (const axis of AXES) {
    const value = Number(raw[axis]);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return { ok: false, field: axis, message: `${axis} must be a whole number from 1 to 5.` };
    }
    out[axis as Axis] = value;
  }
  return { ok: true, ratings: out };
}

/**
 * Record a review against a job.
 *
 * `subjectId` is the kaarigar being reviewed and is taken from the JOB, never
 * from the request. Accepting it from the caller would let anyone holding one
 * valid link post a review onto a different worker's passport.
 */
export async function createReview(params: {
  jobId: string;
  subjectId: string;
  ratings: unknown;
  text?: unknown;
}): Promise<CreateReviewOutcome> {
  const parsed = parseRatings(params.ratings);
  if (!parsed.ok) return { status: 'rejected', field: parsed.field, message: parsed.message };

  const text = typeof params.text === 'string' ? params.text.trim().slice(0, 1000) : undefined;

  await ensureIndexes();

  const review: Review = {
    id: uuidv7(),
    jobId: params.jobId,
    // The reviewer is not an account. Recording the token's job as the author
    // is honest about that - inventing a customer id would imply an identity
    // that was never verified.
    authorId: `job:${params.jobId}`,
    subjectId: params.subjectId,
    ratings: parsed.ratings,
    text: text || undefined,
    createdAt: new Date().toISOString(),
  };

  try {
    const { id, ...rest } = review;
    await getDb().collection(REVIEWS).insertOne({ _id: id as never, ...rest });
    return { status: 'created', review };
  } catch (err) {
    // Duplicate key on jobId: someone submitted twice, or two tabs raced. Both
    // mean the link is spent, which is a normal outcome rather than an error.
    if ((err as { code?: number }).code === 11000) return { status: 'already_reviewed' };
    throw err;
  }
}

export async function findReviewByJob(jobId: string): Promise<Review | null> {
  const doc = await getDb().collection(REVIEWS).findOne({ jobId });
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, id: String(_id) } as Review;
}

export interface ReviewSummary {
  count: number;
  /** Mean across all four axes, or null when there are no reviews. */
  average: number | null;
  axes: Record<Axis, number> | null;
  recent: Array<{ ratings: ReviewRatings; text?: string; createdAt: string }>;
}

/**
 * Aggregate for a worker's public passport.
 *
 * Returns nulls rather than zeros when there is nothing to average. A zero
 * would render as a 0-star worker, which is precisely the "new joiner starts at
 * zero" failure section 11 forbids - and it would be a lie about someone's
 * livelihood rather than a rounding choice.
 */
export async function summariseFor(subjectId: string, recentLimit = 3): Promise<ReviewSummary> {
  await ensureIndexes();
  const docs = await getDb()
    .collection(REVIEWS)
    .find({ subjectId })
    .sort({ createdAt: -1 })
    .toArray();

  if (docs.length === 0) return { count: 0, average: null, axes: null, recent: [] };

  const totals = { workmanship: 0, punctuality: 0, priceHonesty: 0, cleanliness: 0 };
  for (const d of docs) {
    const r = d.ratings as ReviewRatings;
    for (const axis of AXES) totals[axis] += Number(r?.[axis] ?? 0);
  }

  const axes = {} as Record<Axis, number>;
  for (const axis of AXES) axes[axis] = Math.round((totals[axis] / docs.length) * 10) / 10;

  const average =
    Math.round((AXES.reduce((sum, a) => sum + axes[a], 0) / AXES.length) * 10) / 10;

  return {
    count: docs.length,
    average,
    axes,
    recent: docs.slice(0, recentLimit).map((d) => ({
      ratings: d.ratings as ReviewRatings,
      text: typeof d.text === 'string' ? d.text : undefined,
      createdAt: String(d.createdAt),
    })),
  };
}
