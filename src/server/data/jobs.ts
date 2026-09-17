import { getDb } from '../db';
import { uuidv7 } from '../../lib/ids';
import { JOB_TRANSITIONS } from '../../types';
import type { JobItem, JobState, JobStateTransition } from '../../types';

/**
 * Data access for the jobs collection.
 *
 * Owner: Track A (jobs-svc). Both the HTTP route and sync-svc's batch ingest
 * call through here rather than each writing their own validation and insert.
 *
 * That is not tidiness - it is correctness. If /api/jobs and /api/sync/batch
 * validated separately, they would drift, and the failure mode is a record the
 * online path rejects but the offline path accepts. The user would then see
 * their entry succeed offline and vanish on reconnect, which is precisely the
 * trust problem section 9.1 says visible sync state exists to prevent.
 */

export const JOBS = 'jobs';

export type CreateOutcome =
  | { status: 'created'; job: JobItem }
  | { status: 'duplicate'; job: JobItem }
  | { status: 'conflict' }
  | { status: 'rejected'; field?: string; message: string };

export const isJobState = (v: unknown): v is JobState =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(JOB_TRANSITIONS, v);

let indexesReady = false;
export async function ensureJobIndexes() {
  if (indexesReady) return;
  const db = getDb();
  await db.collection(JOBS).createIndex({ kaarigarId: 1, date: -1 });
  await db.collection(JOBS).createIndex({ kaarigarId: 1, status: 1 });
  // The customer side reads the same collection from the other end.
  await db.collection(JOBS).createIndex({ customerId: 1, date: -1 });
  indexesReady = true;
}

/**
 * Fields the SERVER decides, never the request body.
 *
 * Optional, and absent for the kaarigar path, so POST /api/jobs and
 * /api/sync/batch call this function exactly as they did before.
 */
export interface CreateJobContext {
  /**
   * Who performed the creating transition, for stateHistory[0].by.
   * Defaults to the owner - true when a kaarigar logs their own job, false
   * when a customer requests one, and the history should not say otherwise.
   */
  actorId?: string;
  /**
   * The authenticated customer. Takes precedence over anything the body says,
   * so a customer cannot file a request in someone else's name.
   */
  customerId?: string;
}

/**
 * Validate and insert one job, idempotently on the client-generated id.
 *
 * THE ONLY WRITE PATH INTO `jobs`. Three callers - POST /api/jobs,
 * POST /api/sync/batch and POST /api/customer/jobs - and one insertOne, which
 * is below. A route cannot skip a rule here, because no route reaches the
 * collection without coming through this function.
 *
 * That is what keeps the kaarigar and customer paths from drifting: they do not
 * agree to run the same checks, they are physically incapable of running
 * different ones. `kaarigarId` stays a PARAMETER rather than a body field for
 * the same reason - each caller states the owner explicitly, and POST /api/jobs
 * can go on passing req.user.uid while the customer route passes an id it
 * resolved and verified itself.
 *
 * Returns an outcome rather than throwing, because sync-svc needs to reject one
 * item and continue with the rest of the batch - an exception would take the
 * whole flush down and the user would lose a day's offline work.
 */
export async function createJob(
  kaarigarId: string,
  input: unknown,
  context: CreateJobContext = {}
): Promise<CreateOutcome> {
  const body = (input ?? {}) as Partial<JobItem>;

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const amount = Number(body.amount);

  if (!title) return { status: 'rejected', field: 'title', message: 'title is required.' };
  if (!Number.isFinite(amount) || amount < 0) {
    return { status: 'rejected', field: 'amount', message: 'amount must be a non-negative number.' };
  }
  if (body.status !== undefined && body.status !== 'REQUESTED') {
    return {
      status: 'rejected',
      field: 'status',
      message: 'New jobs must start in REQUESTED. Use the transition endpoint to advance the lifecycle.',
    };
  }
  if (body.date !== undefined && (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date))) {
    return { status: 'rejected', field: 'date', message: 'date must be YYYY-MM-DD.' };
  }

  await ensureJobIndexes();
  const db = getDb();
  const id = typeof body.id === 'string' && body.id ? body.id : uuidv7();

  /**
   * The idempotency lookup is UNSCOPED, and ownership then picks the branch.
   *
   * Scoping the read by kaarigarId meant another user's id looked absent, the
   * insert fell through, and Mongo rejected it on the collection-wide unique
   * _id - surfacing as a 500 that the outbox would retry forever. Ownership has
   * to select the branch, not filter the query:
   *
   *   absent                  -> insert
   *   present, caller owns it -> idempotent success (a retry of their own write)
   *   present, someone else   -> conflict
   */
  const claimed = await db.collection(JOBS).findOne({ _id: id as never });
  if (claimed) {
    if (claimed.kaarigarId !== kaarigarId) return { status: 'conflict' };
    if (context.customerId && claimed.customerId !== context.customerId) return { status: 'conflict' };
    const { _id, ...j } = claimed;
    return { status: 'duplicate', job: { ...j, id: String(_id) } as JobItem };
  }

  const now = new Date().toISOString();
  // Creation is a trust boundary. Accepting COMPLETED here would let a client
  // manufacture verified-work evidence without traversing the state machine.
  const status: JobState = 'REQUESTED';
  const actorId = context.actorId ?? kaarigarId;
  const stateHistory: JobStateTransition[] = [{ state: status, at: now, by: actorId }];

  const job: Omit<JobItem, 'id'> = {
    kaarigarId,
    title,
    customerName: typeof body.customerName === 'string' ? body.customerName : '',
    // Only the authenticated customer route can link a real customer account.
    customerId: context.customerId,
    customerPhone: typeof body.customerPhone === 'string' ? body.customerPhone : undefined,
    location: typeof body.location === 'string' ? body.location : '',
    amount,
    agreedPrice: Number.isFinite(Number(body.agreedPrice)) ? Number(body.agreedPrice) : undefined,
    paymentMethod: body.paymentMethod === 'upi' || body.paymentMethod === 'cash' ? body.paymentMethod : 'pending',
    status,
    stateHistory,
    // Server-held rows are synced by definition; pending/failed describe the
    // client's outbox, not this collection.
    syncState: 'synced',
    date: typeof body.date === 'string' ? body.date : now.slice(0, 10),
    time: typeof body.time === 'string' ? body.time : undefined,
    notes: typeof body.notes === 'string' ? body.notes : undefined,
    skillsTagged: Array.isArray(body.skillsTagged) ? body.skillsTagged.filter((s) => typeof s === 'string') : undefined,
  };

  try {
    await db.collection(JOBS).insertOne({ _id: id as never, ...job });
  } catch (err) {
    // The unscoped read above closes the common case but not the race: two
    // concurrent creates of the same id both see it absent. A race that only
    // fires under load is the version of this bug that survives to Day 9, so
    // the duplicate-key error routes back through the SAME three branches.
    if ((err as { code?: number }).code === 11000) {
      const raced = await db.collection(JOBS).findOne({ _id: id as never });
      if (!raced) throw err;
      if (raced.kaarigarId !== kaarigarId) return { status: 'conflict' };
      if (context.customerId && raced.customerId !== context.customerId) return { status: 'conflict' };
      const { _id, ...j } = raced;
      return { status: 'duplicate', job: { ...j, id: String(_id) } as JobItem };
    }
    throw err;
  }
  return { status: 'created', job: { id, ...job } };
}

/**
 * The author recorded on a state change nobody pressed a button for.
 *
 * A LITERAL STRING WHERE EVERY OTHER ENTRY HOLDS A uid, and safe precisely
 * because ids here are UUIDv7 - 'system' cannot collide with one. That matters
 * to more than readability: countCustomerReturns in routes/customer.ts counts
 * REQUESTED entries authored by a specific customer to enforce the counter cap,
 * so an expiry written by the sweeper must be attributable to nobody rather
 * than to one of the two parties.
 */
export const SYSTEM_ACTOR = 'system';

/**
 * Cancel a job because a booking deadline passed - an unanswered request, an
 * agreed job that was never scheduled, or a no-show.
 *
 * WHY THIS LIVES HERE. This module owns the `jobs` collection (Architecture
 * §5.2), and the booking transition module must not reach into it directly. It
 * is the one function the reliability feature adds to an existing file, and it
 * is purely additive: nothing above it changes.
 *
 * The legal source states are DERIVED FROM JOB_TRANSITIONS rather than listed,
 * so this cannot outlive an edit to the table - exactly the reasoning that put
 * the transition guard in the table in the first place. A job already terminal,
 * or in a state with no CANCELLED edge, is left alone and reported as false.
 *
 * Ownership is deliberately NOT part of the filter. Every other read in this
 * module is scoped to the owner because the caller is the owner; here the
 * caller is a deadline, which belongs to neither party. Authorisation is that
 * the booking whose clock ran out names this job.
 */
export async function cancelJobBySystem(jobId: string, note?: string): Promise<boolean> {
  const cancellable = (Object.keys(JOB_TRANSITIONS) as JobState[])
    .filter((state) => JOB_TRANSITIONS[state].includes('CANCELLED'));

  const entry: JobStateTransition = {
    state: 'CANCELLED',
    at: new Date().toISOString(),
    by: SYSTEM_ACTOR,
  };

  const updated = await getDb().collection(JOBS).findOneAndUpdate(
    // The status is in the FILTER, so a job that moved between the booking
    // transition and this write is left exactly as the other writer left it.
    { _id: jobId as never, status: { $in: cancellable } },
    {
      $set: { status: 'CANCELLED' as JobState },
      $push: { stateHistory: { ...entry, ...(note ? { note } : {}) } as never },
    },
    { returnDocument: 'after' }
  );

  return updated !== null;
}

/** Does this job exist for this owner? Used by sync to validate ledger jobId links. */
export async function jobExists(kaarigarId: string, jobId: string): Promise<boolean> {
  const doc = await getDb().collection(JOBS).findOne({ _id: jobId as never, kaarigarId }, { projection: { _id: 1 } });
  return doc !== null;
}

export interface JobOutcomeCounts {
  total: number;
  completed: number;
  cancelled: number;
}

/**
 * Count the job evidence used by the published trust rubric.
 *
 * This deliberately stays a server-side aggregate: a worker can edit their
 * profile, but they cannot edit the jobs that contribute to this breakdown.
 * SETTLED and REVIEWED remain completed work for scoring purposes because a
 * payment or review is a later state in the same legal lifecycle.
 */
export async function countJobOutcomes(kaarigarId: string): Promise<JobOutcomeCounts> {
  const collection = getDb().collection(JOBS);
  const [total, completed, cancelled] = await Promise.all([
    collection.countDocuments({ kaarigarId }),
    collection.countDocuments({ kaarigarId, status: { $in: ['COMPLETED', 'SETTLED', 'REVIEWED'] } }),
    collection.countDocuments({ kaarigarId, status: 'CANCELLED' }),
  ]);

  return { total, completed, cancelled };
}

/**
 * States in which a completed job may be reviewed.
 *
 * Section 8 says "COMPLETED"; the state machine adds SETTLED between COMPLETED
 * and REVIEWED, and a job whose payment has been logged is plainly still
 * reviewable. Both are accepted. Anything earlier is not: section 4D's whole
 * defence against fake reviews is that the work provably happened.
 */
const REVIEWABLE: JobState[] = ['COMPLETED', 'SETTLED'];

export interface ReviewableJob {
  id: string;
  kaarigarId: string;
  title: string;
  customerName: string;
  status: JobState;
  date: string;
  reviewable: boolean;
}

/**
 * Look up a job by id for the review flow, UNSCOPED BY OWNER.
 *
 * Every other read in this module is filtered by kaarigarId because the caller
 * is the owner. This one cannot be: the reviewer is a customer with no account,
 * holding a signed link. Authorisation for this read is the HMAC on that token,
 * verified before this is ever called - see lib/reviewToken.ts.
 *
 * The projection is narrow on purpose. This feeds a page shown to someone who
 * is not the worker, so amount, agreedPrice, customerPhone and location stay
 * out of it; the reviewer needs to recognise the job, not audit it.
 */
export async function findJobForReview(jobId: string): Promise<ReviewableJob | null> {
  const doc = await getDb()
    .collection(JOBS)
    .findOne(
      { _id: jobId as never },
      { projection: { kaarigarId: 1, title: 1, customerName: 1, status: 1, date: 1 } }
    );
  if (!doc) return null;

  const status = doc.status as JobState;
  return {
    id: String(doc._id),
    kaarigarId: String(doc.kaarigarId),
    title: String(doc.title ?? ''),
    customerName: String(doc.customerName ?? ''),
    status,
    date: String(doc.date ?? ''),
    reviewable: REVIEWABLE.includes(status),
  };
}
