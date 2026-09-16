import { bookingsEnabled, nowMs } from '../bookingConfig';
import { findBookingByJobId, type BookingDoc } from '../data/bookings';
import {
  applyOverdueToOne,
  armScheduleDeadline,
  cancel,
  checkin,
  commitSlot,
  complete,
  decline,
  markResponded,
  type TransitionFailure,
  type TransitionResult,
} from './transitions';
import type { JobState } from '../../types';

/**
 * The bridge between the JOB lifecycle and the BOOKING lifecycle.
 *
 * Owner: Track A. The §9.4 mapping table, expressed once, in code.
 *
 * WHY THIS IS NOT INSIDE routes/jobs.ts. That route is the worker's trust
 * boundary and is already dense with rules about who may take which edge.
 * Interleaving a second state machine into it would make both harder to read
 * and would put the mapping in the one place a customer-side caller cannot
 * reuse. Here, routes/jobs.ts and routes/customer.ts call the same functions
 * and cannot drift - the same argument data/jobs.ts makes about createJob.
 *
 * TWO GATES, AND BOTH MUST HOLD BEFORE ANY OF THIS RUNS:
 *
 *   1. THE FLAG. bookingsEnabled() false means every function here is a no-op
 *      and the routes behave exactly as they did before this feature existed.
 *
 *   2. THE LEGACY RULE. A job with NO LINKED BOOKING keeps today's behaviour
 *      forever, in both flag states - no slot, no arrival code, no events. That
 *      covers a worker's own jobs, which have no counterparty to commit to, and
 *      every job already in the database from before the flag was turned on.
 *      Requiring a slot on those would break the worker's lifecycle walk and
 *      strand seeded demo data mid-flow, with no booking anywhere that could
 *      supply the missing code.
 *
 * So the only jobs that ever reach the booking machinery are customer-linked
 * ones created while the flag was on.
 */

/** A refusal, already shaped as this codebase's JSON error body. */
export interface BookingRefusal {
  status: number;
  body: {
    error: string;
    message: string;
    field?: string;
    bookingStatus?: string;
  };
}

export type HookOutcome =
  | { ok: true; booking?: BookingDoc | null }
  | { ok: false; refusal: BookingRefusal };

const OK: HookOutcome = { ok: true };

/**
 * TransitionFailure -> HTTP. One table, so every route refuses the same
 * condition with the same code and the Phase 4/5 screens have one list to
 * branch on.
 *
 * A WRONG ARRIVAL CODE IS 400, NOT 401, AND THAT IS NOT A STYLE CHOICE.
 *
 * 401 was the first answer here - a failed credential check, on the face of it.
 * The browser rehearsal caught what that actually did: request() in lib/api.ts
 * treats EVERY 401 as an expired session, calls the unauthorized handler and
 * signs the user out. So a kaarigar who mistyped one digit of the customer's
 * code was thrown back to the login screen, standing in someone's doorway.
 *
 * 400 is also the more honest reading. The caller IS authenticated - that is
 * how they reached this route at all. What is wrong is one field in the body,
 * which is what `field: 'otp'` says and what every other bad-field refusal in
 * this codebase returns. 429 for the lock, because that one really is rate
 * limiting and the client should say when to come back.
 */
const FAILURE_HTTP: Record<TransitionFailure, { status: number; error: string }> = {
  not_found:             { status: 404, error: 'booking_not_found' },
  wrong_state:           { status: 409, error: 'booking_wrong_state' },
  terminal:              { status: 409, error: 'booking_terminal' },
  deadline_passed:       { status: 409, error: 'booking_request_expired' },
  slot_required:         { status: 400, error: 'slot_required' },
  slot_order:            { status: 400, error: 'invalid_slot_order' },
  slot_in_past:          { status: 400, error: 'slot_in_past' },
  slot_too_long:         { status: 400, error: 'slot_too_long' },
  slot_too_far:          { status: 400, error: 'slot_too_far' },
  otp_required:          { status: 400, error: 'checkin_code_required' },
  otp_incorrect:         { status: 400, error: 'checkin_code_incorrect' },
  otp_locked:            { status: 429, error: 'checkin_locked' },
  reschedule_limit:      { status: 409, error: 'reschedule_limit_reached' },
  reschedule_notice:     { status: 409, error: 'reschedule_too_late' },
  reschedule_pending:    { status: 409, error: 'reschedule_already_pending' },
  no_reschedule_pending: { status: 409, error: 'no_reschedule_pending' },
  too_early:             { status: 400, error: 'too_early' },
  conflict:              { status: 409, error: 'booking_conflict' },
};

const SLOT_FIELDS: ReadonlySet<TransitionFailure> = new Set<TransitionFailure>([
  'slot_required', 'slot_order', 'slot_in_past', 'slot_too_long', 'slot_too_far',
]);

export function refusalFor(result: Extract<TransitionResult, { ok: false }>): BookingRefusal {
  const mapped = FAILURE_HTTP[result.reason];
  return {
    status: mapped.status,
    body: {
      error: mapped.error,
      message: result.message,
      ...(SLOT_FIELDS.has(result.reason) ? { field: 'slotStart' } : {}),
      ...(result.reason === 'otp_incorrect' || result.reason === 'otp_locked' ? { field: 'otp' } : {}),
      ...(result.status ? { bookingStatus: result.status } : {}),
    },
  };
}

function refuse(result: TransitionResult): HookOutcome {
  if (result.ok) return OK;
  return { ok: false, refusal: refusalFor(result) };
}

/**
 * The booking for a job, or null when there isn't one.
 *
 * Null is the LEGACY PATH and is completely normal - see the second gate above.
 * Callers must treat it as "this job has no appointment attached", never as an
 * error, and never as a reason to refuse anything.
 */
export async function bookingForJob(jobId: string, now = nowMs()): Promise<BookingDoc | null> {
  if (!bookingsEnabled()) return null;

  const booking = await findBookingByJobId(jobId);
  if (!booking) return null;

  // CHECK ON READ (§0.4a). Any path that is about to make a decision based on a
  // booking applies its overdue rules first, so the decision is made against
  // the state the booking should already be in rather than the one the last
  // sweep happened to leave behind.
  await applyOverdueToOne(String(booking._id), now);
  return findBookingByJobId(jobId);
}

function numberFrom(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
  }
  return Number.NaN;
}

/**
 * Apply the booking edge for a worker's job transition. §9.4.
 *
 * ORDERING, AND ITS ONE HONEST WEAKNESS. The booking moves BEFORE the job,
 * because the booking carries the gates - the arrival code, the slot rules, the
 * response deadline - and a job must not advance past a gate that refused. Two
 * collections mean no transaction, so a job transition that then loses a race
 * leaves the booking one step ahead.
 *
 * That asymmetry is deliberate rather than merely tolerated: a booking ahead of
 * its job renders as "waiting" on both screens and is corrected by the next
 * attempt, whereas a job ahead of its booking would be a job claiming a
 * commitment nobody made - COMPLETED work with no recorded arrival. When only
 * one of two writes can win, the one that must not be fabricated is the job.
 */
export async function applyWorkerJobEdge(params: {
  booking: BookingDoc;
  next: JobState;
  body: Record<string, unknown>;
  now?: number;
}): Promise<HookOutcome> {
  const { booking, next, body } = params;
  const now = params.now ?? nowMs();
  const bookingId = String(booking._id);

  switch (next) {
    /** The first response. Satisfies acceptBy; nothing expires after it. */
    case 'QUOTED':
      return refuse(await markResponded(bookingId, now));

    /**
     * THE COMMITMENT. A slot is mandatory here and nowhere else, which is what
     * turns "I'll come tomorrow" into something a clock can check.
     *
     * The plain arrival code is minted inside commitSlot and DELIBERATELY
     * DROPPED on the floor here. The caller is the kaarigar's route, and a
     * kaarigar who can read the code can check in from anywhere - see
     * lib/checkinOtp.ts. It reaches the customer through
     * GET /api/bookings/:id/otp and by no other path.
     */
    case 'SCHEDULED': {
      const slotStart = numberFrom(body.slotStart);
      const slotEnd = numberFrom(body.slotEnd);
      if (!Number.isFinite(slotStart) || !Number.isFinite(slotEnd)) {
        return {
          ok: false,
          refusal: {
            status: 400,
            body: {
              error: 'slot_required',
              field: 'slotStart',
              message: 'Pick a date and a time window before starting this job.',
            },
          },
        };
      }
      return refuse(await commitSlot(bookingId, slotStart, slotEnd, now));
    }

    /** THE ARRIVAL. The code is the only evidence the worker was actually there. */
    case 'IN_PROGRESS': {
      const otp = body.otp;
      if (typeof otp !== 'string' || !/^\d{4}$/.test(otp.trim())) {
        return {
          ok: false,
          refusal: {
            status: 400,
            body: {
              error: 'checkin_code_required',
              field: 'otp',
              message: "Ask the customer for their 4-digit arrival code.",
            },
          },
        };
      }
      return refuse(await checkin(bookingId, otp.trim(), now));
    }

    case 'COMPLETED':
      return refuse(await complete(bookingId, 'kaarigar', now));

    /**
     * Withdrawing. Which edge that is depends on how far the booking got:
     * walking away from a request nobody has answered is a DECLINE and costs
     * nothing; walking away from a commitment is a cancel, and may cost -1 or,
     * if the kaarigar is already late, -3.
     */
    case 'CANCELLED':
      return booking.status === 'REQUESTED'
        ? refuse(await decline(bookingId, now))
        : refuse(await cancel(bookingId, 'kaarigar', now));

    /**
     * Every other edge is purely about the PRICE and moves no booking:
     * REQUESTED (a decline or counter), ACCEPTED, SETTLED, DISPUTED, REVIEWED.
     * The customer-side routes handle the two that do have booking effects.
     */
    default:
      return OK;
  }
}

/** The customer agreed the price: arm the slot-commitment clock. §9.4. */
export async function onCustomerAcceptedPrice(
  booking: BookingDoc,
  now = nowMs()
): Promise<HookOutcome> {
  return refuse(await armScheduleDeadline(String(booking._id), now));
}

/**
 * The customer cancelled. Never writes an event against them - but if the
 * kaarigar was already LATE, this lands in NO_SHOW and the kaarigar takes -3.
 * §9.4: the customer waited, and then stopped waiting.
 */
export async function onCustomerCancelled(
  booking: BookingDoc,
  now = nowMs()
): Promise<HookOutcome> {
  return refuse(await cancel(String(booking._id), 'customer', now));
}
