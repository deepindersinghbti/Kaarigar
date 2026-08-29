import { getDb } from '../db';
import { uuidv7 } from '../../lib/ids';
import type { KamaiEntry, LedgerDirection } from '../../types';

/**
 * Data access for the ledger_entries collection.
 *
 * Owner: Track A (ledger-svc). Shared by the HTTP route and sync-svc's batch
 * ingest for the same reason as data/jobs.ts: divergent validation between the
 * online and offline paths produces entries that succeed offline and disappear
 * on reconnect.
 *
 * Append-only. There is no update and no delete here, by design - not by
 * omission (section 4B).
 */

export const ENTRIES = 'ledger_entries';

export type EntryOutcome =
  | { status: 'created'; entry: KamaiEntry }
  | { status: 'duplicate'; entry: KamaiEntry }
  | { status: 'rejected'; field?: string; message: string };

export const isDirection = (v: unknown): v is LedgerDirection => v === 'in' || v === 'out';

let indexesReady = false;
export async function ensureLedgerIndexes() {
  if (indexesReady) return;
  const db = getDb();
  await db.collection(ENTRIES).createIndex({ profileId: 1, date: -1 });
  await db.collection(ENTRIES).createIndex({ profileId: 1, direction: 1 });
  await db.collection(ENTRIES).createIndex(
    { reversesId: 1 },
    { unique: true, partialFilterExpression: { reversesId: { $type: 'string' } } }
  );
  indexesReady = true;
}

/** Validate and insert one ledger entry, idempotently on the client id. */
export async function createEntry(profileId: string, input: unknown): Promise<EntryOutcome> {
  const body = (input ?? {}) as Partial<KamaiEntry>;
  const amount = Number(body.amount);

  if (!isDirection(body.direction)) {
    return { status: 'rejected', field: 'direction', message: "direction must be 'in' or 'out'." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      status: 'rejected',
      field: 'amount',
      message: 'amount must be a positive number. To correct an entry, reverse it.',
    };
  }
  if (typeof body.description !== 'string' || !body.description.trim()) {
    return { status: 'rejected', field: 'description', message: 'description is required.' };
  }
  if (body.paymentType !== 'cash' && body.paymentType !== 'upi') {
    return { status: 'rejected', field: 'paymentType', message: "paymentType must be 'cash' or 'upi'." };
  }
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return { status: 'rejected', field: 'date', message: 'date must be YYYY-MM-DD.' };
  }

  await ensureLedgerIndexes();
  const db = getDb();
  const id = typeof body.id === 'string' && body.id ? body.id : uuidv7();

  const existing = await db.collection(ENTRIES).findOne({ _id: id as never, profileId });
  if (existing) {
    const { _id, ...e } = existing;
    return { status: 'duplicate', entry: { ...e, id: String(_id) } as KamaiEntry };
  }

  const entry: Omit<KamaiEntry, 'id'> = {
    profileId,
    direction: body.direction,
    syncState: 'synced',
    date: body.date,
    amount,
    description: body.description.trim(),
    customerName: typeof body.customerName === 'string' ? body.customerName : undefined,
    paymentType: body.paymentType,
    jobId: typeof body.jobId === 'string' ? body.jobId : undefined,
    category: typeof body.category === 'string' ? body.category : undefined,
    createdAt: new Date().toISOString(),
  };

  await db.collection(ENTRIES).insertOne({ _id: id as never, ...entry });
  return { status: 'created', entry: { id, ...entry } };
}
