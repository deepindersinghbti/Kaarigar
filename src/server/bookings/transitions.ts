import { getDb } from '../db';
import {
  BOOKINGS,
  asBookingDoc,
  ensureBookingIndexes,
  findBookingDoc,
  isTerminalBooking,
  shapeBooking,
  type BookingDoc,
} from '../data/bookings';
import { appendEvent } from '../data/reliability';
import { cancelJobBySystem } from '../data/jobs';
import {
  bookingConfig,
  nowMs,
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
} from '../bookingConfig';
import { checkinOtpMatches, generateCheckinOtp, hashCheckinOtp } from '../lib/checkinOtp';
import type { Booking, BookingStatus, ReliabilityEventType } from '../../types';

/**
 * THE booking state machine. Every edge in §9.4 lives here and nowhere else.
 *
 * Owner: Track A.
 *
 * TWO RULES THAT MAKE THE REST OF THE FEATURE SAFE:
 *
 * 1. ROUTES NEVER SET `status`. They call a function here. A route that writes
 *    a status directly can skip a deadline check, a penalty, or the job
 *    side-effect, and none of those omissions is visible in review - the code
 *    still reads like a correct update.
 *
 * 2. EVERY EDGE IS ONE CONDITIONAL findOneAndUpdate NAMING THE EXPECTED STATUS.
 *    Not load-check-write. Two sweeps, a sweep racing a check-in, or a customer
 *    double-tap all resolve to one winner and one 409, because the loser's
 *    filter no longer matches. Where a check needs the document first (an OTP,
 *    a slot's notice period) it is read, checked, and then written with the
 *    status it was read at - so a change in between loses the write rather than
 *    silently applying to a different state.
 *
 * Penalties are appended AFTER a successful move, and appendEvent is idempotent
 * on { bookingId, type }, so a crash between the two is recoverable by the next
 * sweep rather than being a lost or doubled penalty.
 */

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type TransitionFailure =
  | 'not_found'
  | 'wrong_state'
  | 'terminal'
  | 'deadline_passed'
  | 'slot_required'
  | 'slot_order'
  | 'slot_in_past'
  | 'slot_too_long'
  | 'slot_too_far'
  | 'otp_required'
  | 'otp_incorrect'
  | 'otp_locked'
  | 'reschedule_limit'
  | 'reschedule_notice'
  | 'reschedule_pending'
  | 'no_reschedule_pending'
  | 'too_early'
  | 'conflict';

export type TransitionResult =
  | {
      ok: true;
      booking: Booking;
      /**
       * The plain arrival code, returned by commitSlot and by NOTHING else.
       *
       * It exists for exactly as long as the response that carries it to the
       * CUSTOMER. It is never stored in plain form and never returned to the
       * kaarigar - see the note in lib/checkinOtp.ts about what the code
       * actually proves.
       */
      otp?: string;
      event?: ReliabilityEventType;
    }
  | {
      ok: false;
      reason: TransitionFailure;
      message: string;
      /** The state the booking is actually in, for the caller's 409 body. */
      status?: BookingStatus;
    };

function fail(
  reason: TransitionFailure,
  message: string,
  status?: BookingStatus
): TransitionResult {
  return { ok: false, reason, message, ...(status ? { status } : {}) };
}

// ---------------------------------------------------------------------------
// The one write primitive
// ---------------------------------------------------------------------------

interface MoveSpec {
  bookingId: string;
  /** The status the caller believes it is in. Part of the filter, always. */
  from: BookingStatus;
  to: BookingStatus;
  by: 'customer' | 'kaarigar' | 'system';
  at: number;
  note?: string;
  set?: Record<string, unknown>;
  /**
   * Fields to remove. NEVER set a date field to null instead: BSON orders null
   * below Date, so a nulled arriveBy matches `{ $lte: now }` and the booking is
   * swept LATE the instant it is written.
   */
  unset?: string[];
  inc?: Record<string, number>;
  /** Extra filter clauses, ANDed with the id and status. */
  filter?: Record<string, unknown>;
}

async function move(spec: MoveSpec): Promise<BookingDoc | null> {
  const update: Record<string, unknown> = {
    $set: { status: spec.to, ...(spec.set ?? {}) },
    $push: {
      history: {
        from: spec.from,
        to: spec.to,
        by: spec.by,
        at: new Date(spec.at),
        ...(spec.note ? { note: spec.note } : {}),
      },
    },
  };
  if (spec.unset && spec.unset.length > 0) {
    update.$unset = Object.fromEntries(spec.unset.map((field) => [field, '']));
  }
  if (spec.inc) update.$inc = spec.inc;

  const updated = await getDb().collection(BOOKINGS).findOneAndUpdate(
    { _id: spec.bookingId as never, status: spec.from, ...(spec.filter ?? {}) },
    update as never,
    { returnDocument: 'after' }
  );

  return asBookingDoc(updated);
}

/** Append a penalty and cancel the linked job, in the order the record needs. */
async function recordPenalty(
  doc: BookingDoc,
  type: ReliabilityEventType,
  at: number,
  cancelJob: boolean
): Promise<void> {
  await appendEvent({ bookingId: String(doc._id), kaarigarId: doc.kaarigarId, type, at });
  if (cancelJob && doc.jobId) {
    await cancelJobBySystem(doc.jobId, `booking ${type}`);
  }
}

// ---------------------------------------------------------------------------
// Slot validation
// ---------------------------------------------------------------------------

export function validateSlot(
  slotStartMs: number,
  slotEndMs: number,
  now: number
): TransitionFailure | null {
  const config = bookingConfig();

  if (!Number.isFinite(slotStartMs) || !Number.isFinite(slotEndMs)) return 'slot_required';
  if (slotEndMs <= slotStartMs) return 'slot_order';
  if (slotStartMs <= now) return 'slot_in_past';
  if (slotEndMs - slotStartMs > config.maxSlotHours * HOUR_MS) return 'slot_too_long';
  if (slotStartMs - now > config.maxSlotDaysAhead * DAY_MS) return 'slot_too_far';

  return null;
}

// ---------------------------------------------------------------------------
// Kaarigar-driven edges
// ---------------------------------------------------------------------------

/**
 * REQUESTED -> RESPONDED. The kaarigar quoted inside the first-response window.
 *
 * `acceptBy` IS PART OF THE FILTER, so a quote that arrives a millisecond late
 * cannot beat the sweeper by racing it. It is not mutated - it stops applying
 * because the booking has left REQUESTED, and it survives as the record of what
 * the kaarigar was actually given.
 */
export async function markResponded(bookingId: string, now = nowMs()): Promise<TransitionResult> {
  await ensureBookingIndexes();
  const doc = await findBookingDoc(bookingId);
  if (!doc) return fail('not_found', 'No such booking.');
  if (doc.status !== 'REQUESTED') {
    return fail('wrong_state', `Only a new request can be answered. This one is ${doc.status}.`, doc.status);
  }
  if (doc.acceptBy.getTime() <= now) {
    return fail('deadline_passed', 'The time to answer this request has passed.', doc.status);
  }

  const updated = await move({
    bookingId,
    from: 'REQUESTED',
    to: 'RESPONDED',
    by: 'kaarigar',
    at: now,
    filter: { acceptBy: { $gt: new Date(now) } },
  });
  if (!updated) return fail('conflict', 'The request changed while you were answering it.');

  return { ok: true, booking: shapeBooking(updated) };
}

/** REQUESTED -> DECLINED. An honest, prompt "no" costs the kaarigar nothing. */
export async function decline(bookingId: string, now = nowMs()): Promise<TransitionResult> {
  await ensureBookingIndexes();
  const doc = await findBookingDoc(bookingId);
  if (!doc) return fail('not_found', 'No such booking.');
  if (doc.status !== 'REQUESTED') {
    return fail('wrong_state', `Only a new request can be declined. This one is ${doc.status}.`, doc.status);
  }

  const updated = await move({ bookingId, from: 'REQUESTED', to: 'DECLINED', by: 'kaarigar', at: now });
  if (!updated) return fail('conflict', 'The request changed while you were declining it.');

  return { ok: true, booking: shapeBooking(updated) };
}

/**
 * Arm the slot-commitment clock. Called when the linked job reaches ACCEPTED -
 * the customer has agreed the price.
 *
 * STAYS IN RESPONDED; only `scheduleBy` appears. This is the entire mechanism
 * by which no deadline runs while the ball is in the customer's court: a quoted
 * or countered booking simply has no scheduleBy for the sweeper's
 * { status: 'RESPONDED', scheduleBy: { $lte: now } } to match, and there is no
 * special case anywhere that says so.
 *
 * Idempotent: re-arming an already-armed booking leaves the original deadline
 * alone, so a retried request cannot buy the kaarigar another day.
 */
export async function armScheduleDeadline(
  bookingId: string,
  now = nowMs()
): Promise<TransitionResult> {
  await ensureBookingIndexes();
  const doc = await findBookingDoc(bookingId);
  if (!doc) return fail('not_found', 'No such booking.');
  if (doc.status !== 'RESPONDED') {
    return fail('wrong_state', `Only an answered request can be scheduled. This one is ${doc.status}.`, doc.status);
  }
  if (doc.scheduleBy) return { ok: true, booking: shapeBooking(doc) };

  const scheduleBy = new Date(now + bookingConfig().scheduleWindowMin * MINUTE_MS);
  const updated = await getDb().collection(BOOKINGS).findOneAndUpdate(
    { _id: bookingId as never, status: 'RESPONDED', scheduleBy: { $exists: false } },
    { $set: { scheduleBy } },
    { returnDocument: 'after' }
  );
  if (!updated) return fail('conflict', 'The booking changed while the schedule deadline was being set.');

  return { ok: true, booking: shapeBooking(asBookingDoc(updated) as BookingDoc) };
}

/**
 * RESPONDED -> COMMITTED. The kaarigar names a time and the clocks start.
 *
 * Everything that makes a commitment real is written in this one update:
 * `slotStart`, `slotEnd`, the derived `arriveBy`, and the arrival code's hash.
 * `scheduleBy` is unset in the same breath, because it has been satisfied.
 *
 * Returns the plain OTP ONCE. The caller's only correct move is to put it on a
 * customer-facing response; it is not stored, not logged, and not recoverable.
 */
export async function commitSlot(
  bookingId: string,
  slotStartMs: number,
  slotEndMs: number,
  now = nowMs()
): Promise<TransitionResult> {
  await ensureBookingIndexes();
  const doc = await findBookingDoc(bookingId);
  if (!doc) return fail('not_found', 'No such booking.');
  if (doc.status !== 'RESPONDED') {
    return fail('wrong_state', `A time can only be set on an answered request. This one is ${doc.status}.`, doc.status);
  }

  const invalid = validateSlot(slotStartMs, slotEndMs, now);
  if (invalid) return fail(invalid, slotMessage(invalid));

  const otp = generateCheckinOtp();
  const updated = await move({
    bookingId,
    from: 'RESPONDED',
    to: 'COMMITTED',
    by: 'kaarigar',
    at: now,
    set: {
      slotStart: new Date(slotStartMs),
      slotEnd: new Date(slotEndMs),
      arriveBy: new Date(slotEndMs + bookingConfig().arrivalGraceMin * MINUTE_MS),
      otpHash: hashCheckinOtp(otp, bookingId),
      otpAttempts: 0,
    },
    unset: ['scheduleBy', 'otpLockedUntil'],
  });
  if (!updated) return fail('conflict', 'The booking changed while the time was being set.');

  return { ok: true, booking: shapeBooking(updated), otp };
}

function slotMessage(reason: TransitionFailure): string {
  const config = bookingConfig();
  switch (reason) {
    case 'slot_order':    return 'The end of the slot must be after its start.';
    case 'slot_in_past':  return 'That time has already passed.';
    case 'slot_too_long': return `A slot cannot be longer than ${config.maxSlotHours} hours.`;
    case 'slot_too_far':  return `Pick a time within the next ${config.maxSlotDaysAhead} days.`;
    default:              return 'Pick a date and a time window.';
  }
}

/**
 * COMMITTED | LATE -> ARRIVED, on the customer's code.
 *
 * OVERDUE RULES RUN FIRST. Without that, a check-in landing after `arriveBy`
 * but before the sweeper's next tick would find the booking still COMMITTED and
 * be written up as ON_TIME - which would make the whole score depend on how
 * recently a cron job happened to fire. Applying the deadline first is what
 * "check on read" means, and it is why arriving late is recorded as arriving
 * late whether or not anyone was watching.
 *
 * A LATE check-in writes NO event. §2: the LATE penalty already stands, and
 * turning up eventually does not earn the credit for turning up on time.
 */
export async function checkin(
  bookingId: string,
  code: string,
  now = nowMs()
): Promise<TransitionResult> {
  await ensureBookingIndexes();
  await applyOverdueToOne(bookingId, now);

  const doc = await findBookingDoc(bookingId);
  if (!doc) return fail('not_found', 'No such booking.');
  if (doc.status !== 'COMMITTED' && doc.status !== 'LATE') {
    return fail('wrong_state', `This job is ${doc.status}, so there is nothing to check in to.`, doc.status);
  }

  const config = bookingConfig();
  if (doc.otpLockedUntil instanceof Date && doc.otpLockedUntil.getTime() > now) {
    return fail('otp_locked', `Too many wrong codes. Try again in ${config.checkinLockMin} minutes.`, doc.status);
  }
  if (!doc.otpHash) {
    return fail('otp_required', 'This job has no arrival code yet.', doc.status);
  }

  if (!checkinOtpMatches(String(code ?? ''), bookingId, doc.otpHash)) {
    const attempts = (typeof doc.otpAttempts === 'number' ? doc.otpAttempts : 0) + 1;
    const locked = attempts >= config.checkinOtpMaxAttempts;

    await getDb().collection(BOOKINGS).updateOne(
      { _id: bookingId as never },
      locked
        // The counter resets WITH the lock, so the next window is a fresh five
        // rather than one attempt before an immediate re-lock.
        ? { $set: { otpAttempts: 0, otpLockedUntil: new Date(now + config.checkinLockMin * MINUTE_MS) } }
        : { $set: { otpAttempts: attempts } }
    );

    return locked
      ? fail('otp_locked', `Too many wrong codes. Try again in ${config.checkinLockMin} minutes.`, doc.status)
      : fail('otp_incorrect', `That code is not right. ${config.checkinOtpMaxAttempts - attempts} tries left.`, doc.status);
  }

  const from = doc.status;
  const updated = await move({
    bookingId,
    from,
    to: 'ARRIVED',
    by: 'kaarigar',
    at: now,
    set: { arrivedAt: new Date(now) },
    unset: ['otpAttempts', 'otpLockedUntil'],
  });
  if (!updated) return fail('conflict', 'The job changed while you were checking in.');

  if (from === 'COMMITTED') {
    await appendEvent({ bookingId, kaarigarId: doc.kaarigarId, type: 'ON_TIME', at: now });
    return { ok: true, booking: shapeBooking(updated), event: 'ON_TIME' };
  }
  return { ok: true, booking: shapeBooking(updated) };
}

/** ARRIVED -> COMPLETED. Either party may close out work that demonstrably began. */
export async function complete(
  bookingId: string,
  by: 'customer' | 'kaarigar',
  now = nowMs()
): Promise<TransitionResult> {
  await ensureBookingIndexes();
  const doc = await findBookingDoc(bookingId);
  if (!doc) return fail('not_found', 'No such booking.');
  if (doc.status !== 'ARRIVED') {
    return fail('wrong_state', `Only a job the kaarigar has arrived at can be completed. This one is ${doc.status}.`, doc.status);
  }

  const updated = await move({
    bookingId,
    from: 'ARRIVED',
    to: 'COMPLETED',
    by,
    at: now,
    set: { completedAt: new Date(now) },
  });
  if (!updated) return fail('conflict', 'The job changed while it was being completed.');

  return { ok: true, booking: shapeBooking(updated) };
}

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------

/**
 * Propose a new slot. Stays in COMMITTED throughout - a reschedule is a change
 * to an existing commitment, not a new one.
 *
 * `rescheduleCount` increments HERE, on the ask, not on the customer's
 * approval. A proposal the customer turned down still moved their day around,
 * and counting approvals only would let a worker re-ask until one stuck.
 */
export async function requestReschedule(
  bookingId: string,
  slotStartMs: number,
  slotEndMs: number,
  reason: string | undefined,
  now = nowMs()
): Promise<TransitionResult> {
  await ensureBookingIndexes();
  const config = bookingConfig();
  const doc = await findBookingDoc(bookingId);
  if (!doc) return fail('not_found', 'No such booking.');
  if (doc.status !== 'COMMITTED') {
    return fail('wrong_state', `Only a scheduled job can be moved. This one is ${doc.status}.`, doc.status);
  }
  if (doc.pendingReschedule) {
    return fail('reschedule_pending', 'The customer has not answered your last new time yet.', doc.status);
  }

  const used = typeof doc.rescheduleCount === 'number' ? doc.rescheduleCount : 0;
  if (used >= config.maxReschedules) {
    return fail('reschedule_limit', `A job can only be moved ${config.maxReschedules} time(s).`, doc.status);
  }
  if (!doc.slotStart || doc.slotStart.getTime() - now < config.rescheduleMinNoticeH * HOUR_MS) {
    return fail('reschedule_notice', `Moving a job needs at least ${config.rescheduleMinNoticeH} hours' notice.`, doc.status);
  }

  const invalid = validateSlot(slotStartMs, slotEndMs, now);
  if (invalid) return fail(invalid, slotMessage(invalid));

  const updated = await getDb().collection(BOOKINGS).findOneAndUpdate(
    { _id: bookingId as never, status: 'COMMITTED', pendingReschedule: { $exists: false } },
    {
      $set: {
        pendingReschedule: {
          slotStart: new Date(slotStartMs),
          slotEnd: new Date(slotEndMs),
          ...(reason ? { reason } : {}),
          requestedAt: new Date(now),
        },
      },
      $inc: { rescheduleCount: 1 },
    },
    { returnDocument: 'after' }
  );
  if (!updated) return fail('conflict', 'The job changed while the new time was being proposed.');

  return { ok: true, booking: shapeBooking(asBookingDoc(updated) as BookingDoc) };
}

/**
 * The customer's answer to a proposed slot.
 *
 * On approval the slot and `arriveBy` are rewritten and `pendingReschedule` is
 * cleared. THE OTP IS NOT REGENERATED: the customer may already have written
 * the code down or read it out, and silently invalidating it would strand the
 * kaarigar on the doorstep with a code that no longer works. The code proves
 * presence, not punctuality - moving the appointment does not change who is
 * standing where.
 *
 * On rejection the original slot simply stands.
 */
export async function respondReschedule(
  bookingId: string,
  approve: boolean,
  now = nowMs()
): Promise<TransitionResult> {
  await ensureBookingIndexes();
  const doc = await findBookingDoc(bookingId);
  if (!doc) return fail('not_found', 'No such booking.');
  if (doc.status !== 'COMMITTED') {
    return fail('wrong_state', `This job is ${doc.status}.`, doc.status);
  }
  if (!doc.pendingReschedule) {
    return fail('no_reschedule_pending', 'There is no new time to answer.', doc.status);
  }

  const pending = doc.pendingReschedule;
  const update = approve
    ? {
        $set: {
          slotStart: pending.slotStart,
          slotEnd: pending.slotEnd,
          arriveBy: new Date(pending.slotEnd.getTime() + bookingConfig().arrivalGraceMin * MINUTE_MS),
        },
        $unset: { pendingReschedule: '' },
      }
    : { $unset: { pendingReschedule: '' } };

  const updated = await getDb().collection(BOOKINGS).findOneAndUpdate(
    { _id: bookingId as never, status: 'COMMITTED', pendingReschedule: { $exists: true } },
    update as never,
    { returnDocument: 'after' }
  );
  if (!updated) return fail('conflict', 'The job changed while the new time was being answered.');

  return { ok: true, booking: shapeBooking(asBookingDoc(updated) as BookingDoc) };
}

// ---------------------------------------------------------------------------
// Cancel and customer-reported non-arrival
// ---------------------------------------------------------------------------

/**
 * Cancel a booking. The outcome depends on WHO and, crucially, on WHETHER THE
 * KAARIGAR IS ALREADY LATE.
 *
 * CANCELLING OUT OF LATE IS A NO-SHOW, whoever presses the button. If the
 * kaarigar cancels, they were already overdue when they did it, and letting
 * that count as a late cancel would price a no-show at -1 instead of -3 for
 * anyone who remembered to tap Cancel on their way past the deadline. If the
 * CUSTOMER cancels a kaarigar who is already late, that is the clearest
 * no-show there is - they waited, and then they stopped waiting. The earlier
 * LATE event stands in both cases; §2 is explicit that a booking which goes
 * LATE then NO_SHOW keeps both.
 *
 * A customer never receives an event of any kind, in any branch.
 */
export async function cancel(
  bookingId: string,
  by: 'customer' | 'kaarigar',
  now = nowMs()
): Promise<TransitionResult> {
  await ensureBookingIndexes();
  const doc = await findBookingDoc(bookingId);
  if (!doc) return fail('not_found', 'No such booking.');
  if (isTerminalBooking(doc.status)) {
    return fail('terminal', `This job is already ${doc.status}.`, doc.status);
  }

  if (doc.status === 'LATE') {
    const updated = await move({ bookingId, from: 'LATE', to: 'NO_SHOW', by, at: now, note: `cancelled by ${by} while late` });
    if (!updated) return fail('conflict', 'The job changed while it was being cancelled.');
    await recordPenalty(updated, 'NO_SHOW', now, true);
    return { ok: true, booking: shapeBooking(updated), event: 'NO_SHOW' };
  }

  const to: BookingStatus = by === 'kaarigar' ? 'CANCELLED_BY_KAARIGAR' : 'CANCELLED_BY_CUSTOMER';
  const from = doc.status;
  const updated = await move({ bookingId, from, to, by, at: now });
  if (!updated) return fail('conflict', 'The job changed while it was being cancelled.');

  /**
   * A late cancel needs a SLOT to be late relative to. A kaarigar who pulls out
   * before committing to a time has broken no promise about when - they have
   * withdrawn from a negotiation, which §2 says writes nothing.
   */
  const slotStart = updated.slotStart ?? doc.slotStart;
  const isLateCancel =
    by === 'kaarigar' &&
    slotStart instanceof Date &&
    slotStart.getTime() - now < bookingConfig().lateCancelNoticeH * HOUR_MS;

  if (isLateCancel) {
    await appendEvent({ bookingId, kaarigarId: doc.kaarigarId, type: 'LATE_CANCEL', at: now });
    return { ok: true, booking: shapeBooking(updated), event: 'LATE_CANCEL' };
  }

  return { ok: true, booking: shapeBooking(updated) };
}

/**
 * COMMITTED -> LATE, reported by the customer standing in their doorway.
 *
 * IDENTICAL IN EVERY RESPECT TO THE TIMER PATH, which is the point: lateness is
 * the same fact whether the sweeper notices it or a person does, and it
 * produces the same single event. The job is NOT cancelled - the kaarigar can
 * still turn up and check in, and §1 keeps that door open deliberately.
 *
 * Refused before `arriveBy`. The kaarigar still has time, and a customer who is
 * merely impatient must not be able to mark someone late early.
 */
export async function reportNoArrival(bookingId: string, now = nowMs()): Promise<TransitionResult> {
  await ensureBookingIndexes();
  const doc = await findBookingDoc(bookingId);
  if (!doc) return fail('not_found', 'No such booking.');

  /**
   * ALREADY LATE IS SUCCESS, not a wrong state.
   *
   * The route reaches this through loadParticipantBooking, which applies the
   * overdue rules first - so by the time arriveBy has passed, the READ has
   * normally already moved the booking to LATE and written the LATE event. The
   * customer is reporting a fact the system has just recorded on its own. The
   * first version refused that as wrong_state, which made this endpoint unable
   * to succeed over HTTP at all: exactly when the report became true, the check
   * before it had already made it redundant. The transition tests missed it
   * because they call this function directly, with no read in front of it.
   *
   * No second event: the LATE row already stands, and the unique ledger key
   * would absorb a duplicate anyway.
   */
  if (doc.status === 'LATE') {
    return { ok: true, booking: shapeBooking(doc) };
  }
  if (doc.status !== 'COMMITTED') {
    return fail('wrong_state', `This job is ${doc.status}.`, doc.status);
  }
  if (!doc.arriveBy || doc.arriveBy.getTime() > now) {
    return fail('too_early', 'The kaarigar still has time to arrive.', doc.status);
  }

  const updated = await move({
    bookingId,
    from: 'COMMITTED',
    to: 'LATE',
    by: 'customer',
    at: now,
    note: 'reported by customer',
  });
  if (!updated) return fail('conflict', 'The job changed while it was being reported.');

  await appendEvent({ bookingId, kaarigarId: doc.kaarigarId, type: 'LATE', at: now });
  return { ok: true, booking: shapeBooking(updated), event: 'LATE' };
}

// ---------------------------------------------------------------------------
// Overdue rules - the read path AND the sweeper
// ---------------------------------------------------------------------------

interface OverdueRule {
  from: BookingStatus;
  to: BookingStatus;
  /** The date field carrying the deadline. */
  field: 'acceptBy' | 'scheduleBy' | 'arriveBy';
  /** Added to the field before comparing with now. */
  graceMs: () => number;
  event: ReliabilityEventType;
  cancelsJob: boolean;
  counter: keyof SweepCounts;
  note: string;
}

/**
 * THE FOUR DEADLINES, in the order they must run.
 *
 * Order is load-bearing. COMMITTED -> LATE sits before LATE -> NO_SHOW so that
 * one pass over a long-abandoned booking produces BOTH events rather than
 * skipping straight to the second - §2 requires a booking that went late and
 * then never arrived to carry both, and a sweeper that ran once a day would
 * otherwise lose the first.
 *
 * Each rule's filter names a STATUS as well as a date. That is what makes
 * correctness independent of whether an unused date field is absent or null: a
 * RESPONDED booking is not a candidate for lateness no matter what it holds.
 * The absent-not-null discipline elsewhere is the second lock on that door.
 */
const OVERDUE_RULES: OverdueRule[] = [
  {
    from: 'REQUESTED',
    to: 'EXPIRED',
    field: 'acceptBy',
    graceMs: () => 0,
    // Zero weight. This feeds responseRate only - it says the kaarigar never
    // answered, not that they broke a promise.
    event: 'EXPIRED',
    cancelsJob: true,
    counter: 'expired',
    note: 'no response before acceptBy',
  },
  {
    from: 'RESPONDED',
    to: 'EXPIRED',
    field: 'scheduleBy',
    graceMs: () => 0,
    /**
     * LATE_CANCEL, not EXPIRED. The kaarigar took the work on and then let an
     * agreed job rot without ever naming a time, which is a broken commitment
     * rather than an unanswered request.
     *
     * It is also what keeps the ledger's unique { bookingId, type } key usable
     * now that EXPIRED is reachable two ways: the two paths write different
     * types, so neither can mask the other.
     */
    event: 'LATE_CANCEL',
    cancelsJob: true,
    counter: 'scheduleExpired',
    note: 'no slot chosen before scheduleBy',
  },
  {
    from: 'COMMITTED',
    to: 'LATE',
    field: 'arriveBy',
    graceMs: () => 0,
    event: 'LATE',
    cancelsJob: false,
    counter: 'late',
    note: 'not arrived by arriveBy',
  },
  {
    from: 'LATE',
    to: 'NO_SHOW',
    field: 'arriveBy',
    graceMs: () => bookingConfig().noShowAfterMin * MINUTE_MS,
    event: 'NO_SHOW',
    cancelsJob: true,
    counter: 'noShow',
    note: 'never arrived',
  },
];

export interface SweepCounts {
  /** Proposed new times the customer never answered. */
  rescheduleAutoRejected: number;
  /** Requests that were never answered. */
  expired: number;
  /** Agreed jobs that were never given a time. */
  scheduleExpired: number;
  late: number;
  noShow: number;
}

function emptyCounts(): SweepCounts {
  return { rescheduleAutoRejected: 0, expired: 0, scheduleExpired: 0, late: 0, noShow: 0 };
}

/**
 * RULE 0. A proposed new time that is still unanswered when the ORIGINAL slot
 * arrives is treated as rejected, and the original commitment stands.
 *
 * WITHOUT THIS, SILENCE WOULD BE A LOOPHOLE. A kaarigar could propose a new
 * time twelve hours out, the customer could simply not look at their phone, and
 * the booking would sit at the original slot with an open proposal attached -
 * so when the kaarigar failed to turn up, it would be genuinely unclear which
 * slot they had failed to turn up to. Closing the proposal at slotStart makes
 * the answer unambiguous: the original slot is the commitment, and arriveBy is
 * measured from it.
 *
 * It resolves in the CUSTOMER'S FAVOUR because the customer never agreed to the
 * change. The alternative - letting an unanswered proposal take effect - would
 * let a worker move an appointment unilaterally by asking at a moment they
 * expected no reply.
 *
 * `rescheduleCount` IS NOT REFUNDED. The attempt was spent when it was made:
 * the customer still had a proposal to consider, and a worker who could get the
 * allowance back by timing the ask badly would have an unlimited supply.
 *
 * Writes NO event. Proposing a reschedule within the rules is legitimate
 * behaviour even when nobody answers it; if the kaarigar then misses the
 * original slot, the ordinary LATE and NO_SHOW rules do their work unchanged.
 */
async function autoRejectPendingReschedule(doc: BookingDoc, now: number): Promise<boolean> {
  if (doc.status !== 'COMMITTED' || !doc.pendingReschedule) return false;
  if (!(doc.slotStart instanceof Date) || doc.slotStart.getTime() > now) return false;

  const updated = await move({
    bookingId: String(doc._id),
    // COMMITTED -> COMMITTED. The commitment does not change; only the
    // outstanding question about it is closed.
    from: 'COMMITTED',
    to: 'COMMITTED',
    by: 'system',
    at: now,
    note: 'new time not answered before the original slot',
    unset: ['pendingReschedule'],
    filter: { pendingReschedule: { $exists: true } },
  });

  return updated !== null;
}

/**
 * Apply one rule to one booking. Returns true if it moved.
 *
 * The status is in the filter, so two sweeps racing over the same document
 * produce exactly one move; and appendEvent is idempotent, so even a torn
 * write between the move and the penalty heals on the next pass.
 */
async function applyRule(rule: OverdueRule, doc: BookingDoc, now: number): Promise<boolean> {
  const deadline = doc[rule.field];
  if (!(deadline instanceof Date)) return false;
  if (deadline.getTime() + rule.graceMs() > now) return false;

  const updated = await move({
    bookingId: String(doc._id),
    from: rule.from,
    to: rule.to,
    by: 'system',
    at: now,
    note: rule.note,
  });
  if (!updated) return false;

  await recordPenalty(updated, rule.event, now, rule.cancelsJob);
  return true;
}

/**
 * Check-on-read for a single booking (§0.4a).
 *
 * Runs the rules in order against one document, so a booking read after a long
 * sleep reports the state it should already have been in rather than the one
 * the last sweep happened to leave behind. Called by checkin() before it does
 * anything, and by the read routes in Phase 2c.
 */
export async function applyOverdueToOne(bookingId: string, now = nowMs()): Promise<SweepCounts> {
  const counts = emptyCounts();
  let doc = await findBookingDoc(bookingId);
  if (!doc) return counts;

  // Rule 0 first: close an unanswered proposal before anything measures
  // lateness, so lateness is always measured against a settled slot.
  if (await autoRejectPendingReschedule(doc, now)) {
    counts.rescheduleAutoRejected += 1;
    const next = await findBookingDoc(bookingId);
    if (next) doc = next;
  }

  for (const rule of OVERDUE_RULES) {
    if (doc.status !== rule.from) continue;
    if (await applyRule(rule, doc, now)) {
      counts[rule.counter] += 1;
      const next = await findBookingDoc(bookingId);
      if (!next) break;
      doc = next;
    }
  }
  return counts;
}

/**
 * The sweeper's pass (§0.4b). Batched, idempotent, and safe to run twice.
 *
 * Each rule takes at most `sweepBatchSize` documents. A full batch means there
 * is more to do, and the next tick does it - ten minutes later, on a deadline
 * measured in hours, which is well inside tolerance. Draining in a loop here
 * would turn one slow pass into a request that never returns on a free-tier
 * instance that is also serving the demo.
 *
 * `scope` narrows to one kaarigar or one booking for tests; the sweeper passes
 * nothing.
 */
export async function applyOverdue(
  scope: Record<string, unknown> = {},
  now = nowMs()
): Promise<SweepCounts> {
  await ensureBookingIndexes();
  const counts = emptyCounts();
  const limit = bookingConfig().sweepBatchSize;

  // RULE 0, and it must run before the four status rules: a booking whose
  // proposed new time is still open is a booking whose slot is ambiguous, and
  // lateness measured against an ambiguous slot is not a fact worth recording.
  const stale = (await getDb()
    .collection(BOOKINGS)
    .find({
      ...scope,
      status: 'COMMITTED',
      pendingReschedule: { $exists: true },
      slotStart: { $lte: new Date(now) },
    })
    .limit(limit)
    .toArray()).map((doc) => asBookingDoc(doc) as BookingDoc);

  for (const doc of stale) {
    if (await autoRejectPendingReschedule(doc, now)) counts.rescheduleAutoRejected += 1;
  }

  for (const rule of OVERDUE_RULES) {
    const due = new Date(now - rule.graceMs());
    const candidates = (await getDb()
      .collection(BOOKINGS)
      .find({ ...scope, status: rule.from, [rule.field]: { $lte: due } })
      .limit(limit)
      .toArray()).map((doc) => asBookingDoc(doc) as BookingDoc);

    for (const doc of candidates) {
      if (await applyRule(rule, doc, now)) counts[rule.counter] += 1;
    }
  }

  return counts;
}
