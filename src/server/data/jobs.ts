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
  indexesReady = true;
}

/**
 * Validate and insert one job, idempotently on the client-generated id.
 *
 * Returns an outcome rather than throwing, because sync-svc needs to reject one
 * item and continue with the rest of the batch - an exception would take the
 * whole flush down and the user would lose a day's offline work.
 */
export async function createJob(kaarigarId: string, input: unknown): Promise<CreateOutcome> {
  const body = (input ?? {}) as Partial<JobItem>;

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const amount = Number(body.amount);

  if (!title) return { status: 'rejected', field: 'title', message: 'title is required.' };
  if (!Number.isFinite(amount) || amount < 0) {
    return { status: 'rejected', field: 'amount', message: 'amount must be a non-negative number.' };
  }
  if (body.status !== undefined && !isJobState(body.status)) {
    return { status: 'rejected', field: 'status', message: 'status is not a known JobState.' };
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
    const { _id, ...j } = claimed;
    return { status: 'duplicate', job: { ...j, id: String(_id) } as JobItem };
  }

  const now = new Date().toISOString();
  const status: JobState = body.status ?? 'REQUESTED';
  const stateHistory: JobStateTransition[] = [{ state: status, at: now, by: kaarigarId }];

  const job: Omit<JobItem, 'id'> = {
    kaarigarId,
    title,
    customerName: typeof body.customerName === 'string' ? body.customerName : '',
    customerId: typeof body.customerId === 'string' ? body.customerId : undefined,
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
      const { _id, ...j } = raced;
      return { status: 'duplicate', job: { ...j, id: String(_id) } as JobItem };
    }
    throw err;
  }
  return { status: 'created', job: { id, ...job } };
}

/** Does this job exist for this owner? Used by sync to validate ledger jobId links. */
export async function jobExists(kaarigarId: string, jobId: string): Promise<boolean> {
  const doc = await getDb().collection(JOBS).findOne({ _id: jobId as never, kaarigarId }, { projection: { _id: 1 } });
  return doc !== null;
}
