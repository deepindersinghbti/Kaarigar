import { getDb } from '../db';
import { uuidv7 } from '../../lib/ids';
import { acceptWindowMs, nowMs } from '../bookingConfig';
import type {
  Booking,
  BookingHistoryEntry,
  BookingStatus,
  RescheduleRequest,
} from '../../types';

/**
 * Data access for the bookings collection.
 *
 * Owner: Track A (bookings-svc). Per Architecture §5.2 this module owns the
 * collection: nothing else names `bookings`, and the transition module reaches
 * it only through here.
 *
 * ONE REQUEST FLOW, TWO RECORDS. A booking is not a second kind of job. The
 * customer's request creates a JobItem exactly as it always did, and a Booking
 * beside it holding the time commitment the job has no fields for - the job
 * owns the PRICE conversation, the booking owns the APPOINTMENT. `jobId` is the
 * only link. A kaarigar's own job, with no customer, gets no booking at all:
 * there is nobody to commit a slot to.
 */

export const BOOKINGS = 'bookings';

/**
 * Statuses from which nothing further can happen.
 *
 * Derived nowhere else. A cancel, a check-in or a sweep that finds a booking in
 * one of these leaves it alone.
 */
export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = [
  'COMPLETED',
  'NO_SHOW',
  'EXPIRED',
  'DECLINED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_KAARIGAR',
];

export function isTerminalBooking(status: BookingStatus): boolean {
  return TERMINAL_BOOKING_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// The stored shape
// ---------------------------------------------------------------------------

export interface BookingHistoryDoc {
  from: BookingStatus | null;
  to: BookingStatus;
  by: 'customer' | 'kaarigar' | 'system';
  at: Date;
  note?: string;
}

export interface RescheduleDoc {
  slotStart: Date;
  slotEnd: Date;
  reason?: string;
  requestedAt: Date;
}

/**
 * The document as Mongo holds it. NOT the contract type.
 *
 * Two deliberate differences from `Booking` in types.ts:
 *
 *   1. Instants are real Dates, not ISO strings. `acceptBy`, `scheduleBy` and
 *      `arriveBy` are all queried with `$lte` against an index, and range
 *      queries on strings are a different and worse thing than range queries on
 *      dates. The contract stays ISO; shapeBooking() converts at the boundary.
 *
 *   2. THE THREE OTP FIELDS EXIST HERE AND NOWHERE ELSE. This interface is the
 *      only place in the codebase that names otpHash, otpAttempts or
 *      otpLockedUntil. `Booking` cannot express them, so no client module can
 *      accidentally serialise one - the omission from the contract is enforced
 *      by the type system rather than by everyone remembering.
 */
export interface BookingDoc {
  _id: string;
  jobId?: string;
  customerId: string;
  kaarigarId: string;
  jobTitle: string;
  description?: string;
  address?: string;
  urgent: boolean;
  status: BookingStatus;
  createdAt: Date;
  acceptBy: Date;
  scheduleBy?: Date;
  slotStart?: Date;
  slotEnd?: Date;
  arriveBy?: Date;
  arrivedAt?: Date;
  completedAt?: Date;
  rescheduleCount: number;
  pendingReschedule?: RescheduleDoc;
  history: BookingHistoryDoc[];

  /** Server-only. Never leaves this process. See lib/checkinOtp.ts. */
  otpHash?: string;
  otpAttempts?: number;
  otpLockedUntil?: Date;
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

let indexesReady = false;

export async function ensureBookingIndexes(): Promise<void> {
  if (indexesReady) return;
  const collection = getDb().collection(BOOKINGS);

  // One index per overdue rule in §9.4. Each is a status equality followed by a
  // date range, which is exactly the shape of the sweeper's four queries.
  await collection.createIndex({ status: 1, acceptBy: 1 });
  await collection.createIndex({ status: 1, scheduleBy: 1 });
  await collection.createIndex({ status: 1, arriveBy: 1 });

  // The two list reads, newest first, matching how jobs are already indexed.
  await collection.createIndex({ kaarigarId: 1, createdAt: -1 });
  await collection.createIndex({ customerId: 1, createdAt: -1 });

  // Rule 0 of the sweep: an unanswered reschedule proposal at the original slot.
  await collection.createIndex({ status: 1, slotStart: 1 });

  // Resolving a job to its booking, on every job transition.
  await collection.createIndex({ jobId: 1 });

  indexesReady = true;
}

// ---------------------------------------------------------------------------
// Boundary conversion
// ---------------------------------------------------------------------------

function iso(value: Date | undefined): string | undefined {
  return value instanceof Date ? value.toISOString() : undefined;
}

function shapeHistory(entries: BookingHistoryDoc[] | undefined): BookingHistoryEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => ({
    from: entry.from ?? null,
    to: entry.to,
    by: entry.by,
    at: iso(entry.at) ?? String(entry.at),
    ...(entry.note ? { note: entry.note } : {}),
  }));
}

function shapeReschedule(pending: RescheduleDoc | undefined): RescheduleRequest | undefined {
  if (!pending) return undefined;
  return {
    slotStart: iso(pending.slotStart) ?? '',
    slotEnd: iso(pending.slotEnd) ?? '',
    ...(pending.reason ? { reason: pending.reason } : {}),
    requestedAt: iso(pending.requestedAt) ?? '',
  };
}

/**
 * The ONLY sanctioned way to turn a stored booking into something a client may
 * see.
 *
 * Built by naming each field rather than by spreading the document and deleting
 * the secrets. A spread-then-delete is one forgotten key away from publishing
 * the arrival hash, and it fails open - a field added to the document later is
 * published by default. This fails closed: a new stored field is invisible
 * until someone adds a line here, which is the direction a privacy boundary
 * should lean. Same reasoning as PUBLIC_PROJECTION in data/profiles.ts.
 *
 * `_id` becomes `id`, matching every other read path in the codebase.
 */
export function shapeBooking(doc: BookingDoc): Booking {
  return {
    id: String(doc._id),
    ...(doc.jobId ? { jobId: doc.jobId } : {}),
    customerId: doc.customerId,
    kaarigarId: doc.kaarigarId,
    jobTitle: doc.jobTitle,
    ...(doc.description ? { description: doc.description } : {}),
    ...(doc.address ? { address: doc.address } : {}),
    urgent: Boolean(doc.urgent),
    status: doc.status,
    createdAt: iso(doc.createdAt) ?? '',
    acceptBy: iso(doc.acceptBy) ?? '',
    ...(doc.scheduleBy ? { scheduleBy: iso(doc.scheduleBy) } : {}),
    ...(doc.slotStart ? { slotStart: iso(doc.slotStart) } : {}),
    ...(doc.slotEnd ? { slotEnd: iso(doc.slotEnd) } : {}),
    ...(doc.arriveBy ? { arriveBy: iso(doc.arriveBy) } : {}),
    ...(doc.arrivedAt ? { arrivedAt: iso(doc.arrivedAt) } : {}),
    ...(doc.completedAt ? { completedAt: iso(doc.completedAt) } : {}),
    // typeof, not `?? 0`: Mongo returns an absent optional number as null, and
    // `null ?? 0` is 0 but `null || 0` and arithmetic on it are not what anyone
    // expects. See the gotcha in CLAUDE.md, which this feature inherits.
    rescheduleCount: typeof doc.rescheduleCount === 'number' ? doc.rescheduleCount : 0,
    ...(doc.pendingReschedule ? { pendingReschedule: shapeReschedule(doc.pendingReschedule) } : {}),
    history: shapeHistory(doc.history),
  };
}

// ---------------------------------------------------------------------------
// Reads and writes
// ---------------------------------------------------------------------------

/**
 * The driver's generic `WithId<Document>` narrowed to our shape.
 *
 * ONE PLACE FOR THE CAST rather than one at every call site. The driver types
 * `_id` as ObjectId and this collection keys on a UUIDv7 string, so the two
 * shapes never structurally overlap and TypeScript insists on the double step.
 * Doing it here means a reader can check the assumption once, and a future
 * change to BookingDoc has one place to look rather than six.
 */
export function asBookingDoc(value: unknown): BookingDoc | null {
  return (value as BookingDoc | null) ?? null;
}

export async function findBookingDoc(bookingId: string): Promise<BookingDoc | null> {
  return asBookingDoc(await getDb().collection(BOOKINGS).findOne({ _id: bookingId as never }));
}

/** The booking for a job, or null for a kaarigar's own job, which never has one. */
export async function findBookingByJobId(jobId: string): Promise<BookingDoc | null> {
  return asBookingDoc(await getDb().collection(BOOKINGS).findOne({ jobId }));
}

export interface CreateBookingInput {
  /** The JobItem this is the appointment for. */
  jobId?: string;
  customerId: string;
  kaarigarId: string;
  jobTitle: string;
  description?: string;
  address?: string;
  urgent: boolean;
}

/**
 * Open a booking in REQUESTED with the first-response clock already running.
 *
 * `acceptBy` is computed here from server time and the urgency flag - never
 * accepted from a request body. A caller-supplied deadline is a caller-supplied
 * answer to the mentor's first question.
 *
 * Idempotent on `jobId`: a retried request that already produced a booking gets
 * that booking back rather than a second one. The outbox replays, the customer
 * double-taps, and neither may put two appointments on one job.
 */
export async function createBooking(input: CreateBookingInput, now = nowMs()): Promise<BookingDoc> {
  await ensureBookingIndexes();

  if (input.jobId) {
    const existing = await findBookingByJobId(input.jobId);
    if (existing) return existing;
  }

  const at = new Date(now);
  const doc: BookingDoc = {
    _id: uuidv7(),
    ...(input.jobId ? { jobId: input.jobId } : {}),
    customerId: input.customerId,
    kaarigarId: input.kaarigarId,
    jobTitle: input.jobTitle,
    ...(input.description ? { description: input.description } : {}),
    ...(input.address ? { address: input.address } : {}),
    urgent: Boolean(input.urgent),
    status: 'REQUESTED',
    createdAt: at,
    acceptBy: new Date(now + acceptWindowMs(Boolean(input.urgent))),
    rescheduleCount: 0,
    // The customer opened it, so the first history entry says so. `from` is
    // null only here: a created booking has no previous state.
    history: [{ from: null, to: 'REQUESTED', by: 'customer', at }],
  };

  await getDb().collection(BOOKINGS).insertOne(doc as never);
  return doc;
}
