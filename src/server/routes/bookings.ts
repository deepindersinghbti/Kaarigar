import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected } from '../db';
import { bookingsEnabled } from '../bookingConfig';
import {
  findBookingDoc,
  shapeBooking,
  type BookingDoc,
} from '../data/bookings';
import { BOOKINGS } from '../data/bookings';
import { getDb } from '../db';
import {
  applyOverdue,
  applyOverdueToOne,
  reportNoArrival,
  requestReschedule,
  respondReschedule,
} from '../bookings/transitions';
import { refusalFor } from '../bookings/jobHooks';
import { hashCheckinOtp } from '../lib/checkinOtp';

/**
 * bookings-svc - the appointment surface both roles share.
 *
 * Owner: Track A. Mounted at /api/bookings.
 *
 * WHY THIS ROUTER CHECKS ROLES PER ROUTE instead of at the mount, which is the
 * house style everywhere else. Every other prefix belongs to exactly one actor:
 * /api/jobs is the worker's, /api/customer is the customer's, and a single
 * requireRole at the mount says so once. This prefix genuinely serves both -
 * they are two parties to one appointment - so a mount-level role gate could
 * only be the union of both, which is no gate at all. The checks therefore live
 * on each handler, and the mount in routes/index.ts carries requireAuth only.
 * See the note there.
 *
 * PARTICIPATION IS CHECKED ON EVERY ROUTE, not just role. Being a customer does
 * not entitle you to somebody else's arrival code.
 */

export const bookingsRouter = Router();

function dbGuard(res: Response): boolean {
  if (isDbConnected()) return true;
  res.status(503).json({
    error: 'database_unavailable',
    message: 'Check MONGODB_URI and the Atlas Network Access allowlist.',
  });
  return false;
}

/**
 * With the flag off this whole surface does not exist.
 *
 * 404, not 403: an endpoint that is switched off should be indistinguishable
 * from one that was never built. A 403 would advertise that the feature is
 * present and merely disabled, which is a hint nobody needs.
 */
function flagGuard(res: Response): boolean {
  if (bookingsEnabled()) return true;
  res.status(404).json({
    error: 'not_found',
    message: 'No handler for this path.',
  });
  return false;
}

function isCustomer(req: Request): boolean {
  return Boolean(req.user?.roles.includes('customer'));
}

function isKaarigar(req: Request): boolean {
  return Boolean(req.user?.roles.includes('kaarigar'));
}

/**
 * Load a booking the caller is actually party to, applying overdue rules first.
 *
 * A booking the caller does not participate in is reported as 404, never 403.
 * A 403 confirms the id exists, which turns this endpoint into an oracle for
 * enumerating other people's appointments.
 */
async function loadParticipantBooking(
  req: Request,
  res: Response
): Promise<BookingDoc | null> {
  await applyOverdueToOne(req.params.id);
  const doc = await findBookingDoc(req.params.id);

  const uid = req.user!.uid;
  if (!doc || (doc.customerId !== uid && doc.kaarigarId !== uid)) {
    res.status(404).json({ error: 'booking_not_found', message: 'No such booking for this user.' });
    return null;
  }
  return doc;
}

/**
 * GET /api/bookings - the caller's own appointments.
 *
 * THE FILTER COMES FROM THE SESSION'S ROLES, never from a query string. §4 of
 * the brief sketched `?role=me`; a role the client names is a role the client
 * can change, and this endpoint would then hand a customer the worker's view by
 * asking for it. A user who holds both roles sees both sides, which is the only
 * honest reading of "their own bookings".
 */
bookingsRouter.get('/', async (req: Request, res: Response) => {
  if (!flagGuard(res) || !dbGuard(res)) return;

  try {
    const uid = req.user!.uid;
    const scope = isCustomer(req) && !isKaarigar(req)
      ? { customerId: uid }
      : isKaarigar(req) && !isCustomer(req)
        ? { kaarigarId: uid }
        : { $or: [{ customerId: uid }, { kaarigarId: uid }] };

    // Check on read, before the list is built, so the rows returned are already
    // in the state their deadlines say they should be in.
    await applyOverdue(scope);

    const docs = await getDb()
      .collection(BOOKINGS)
      .find(scope)
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ bookings: docs.map((doc) => shapeBooking(doc as unknown as BookingDoc)) });
  } catch (err) {
    console.error('[bookings] GET / failed:', err);
    return res.status(500).json({ error: 'bookings_read_failed', message: 'Could not load bookings.' });
  }
});

/** GET /api/bookings/:id - one appointment, for either party to it. */
bookingsRouter.get('/:id', async (req: Request, res: Response) => {
  if (!flagGuard(res) || !dbGuard(res)) return;

  try {
    const doc = await loadParticipantBooking(req, res);
    if (!doc) return;
    return res.json({ booking: shapeBooking(doc) });
  } catch (err) {
    console.error('[bookings] GET /:id failed:', err);
    return res.status(500).json({ error: 'booking_read_failed', message: 'Could not load the booking.' });
  }
});

/**
 * GET /api/bookings/:id/otp - THE ARRIVAL CODE, FOR THE CUSTOMER ONLY.
 *
 * This is the one endpoint in the system that returns a plain arrival code, and
 * the entire evidentiary value of ON_TIME rests on the kaarigar being unable to
 * reach it. Three separate things have to hold:
 *
 *   1. the caller holds the CUSTOMER role;
 *   2. the caller is the customer ON THIS BOOKING, not merely a customer;
 *   3. the booking is COMMITTED or LATE - there is an appointment to arrive at.
 *
 * A kaarigar asking is refused as 403 rather than 404: they are a legitimate
 * party to this booking and will see it on their own screen, so pretending it
 * does not exist would be a confusing lie rather than a useful one. What they
 * must not have is the code.
 *
 * THE CODE IS RECOVERED BY BRUTE FORCE over the 10,000 possibilities, because
 * only its HMAC is stored and that is the point - a leaked database yields
 * nothing without the key. Ten thousand HMACs is a few milliseconds, and it
 * happens only on this route, only for the customer who owns the booking.
 */
bookingsRouter.get('/:id/otp', async (req: Request, res: Response) => {
  if (!flagGuard(res) || !dbGuard(res)) return;

  if (!isCustomer(req)) {
    return res.status(403).json({
      error: 'customer_only',
      message: 'The arrival code is shown to the customer, who gives it to the kaarigar on arrival.',
    });
  }

  try {
    const doc = await loadParticipantBooking(req, res);
    if (!doc) return;

    if (doc.customerId !== req.user!.uid) {
      return res.status(404).json({ error: 'booking_not_found', message: 'No such booking for this user.' });
    }
    if (doc.status !== 'COMMITTED' && doc.status !== 'LATE') {
      return res.status(409).json({
        error: 'otp_not_available',
        message: 'There is no arrival code until the kaarigar has agreed a time.',
        bookingStatus: doc.status,
      });
    }
    if (!doc.otpHash) {
      return res.status(409).json({
        error: 'otp_not_available',
        message: 'This booking has no arrival code yet.',
        bookingStatus: doc.status,
      });
    }

    const bookingId = String(doc._id);
    let otp: string | null = null;
    for (let i = 0; i < 10_000; i += 1) {
      const candidate = String(i).padStart(4, '0');
      if (hashCheckinOtp(candidate, bookingId) === doc.otpHash) {
        otp = candidate;
        break;
      }
    }
    if (!otp) {
      console.error(`[bookings] booking ${bookingId} has an unrecoverable otpHash`);
      return res.status(409).json({ error: 'otp_not_available', message: 'This booking has no usable arrival code.' });
    }

    return res.json({ otp, bookingStatus: doc.status });
  } catch (err) {
    console.error('[bookings] GET /:id/otp failed:', err);
    return res.status(500).json({ error: 'otp_read_failed', message: 'Could not read the arrival code.' });
  }
});

function slotFrom(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

/** POST /api/bookings/:id/reschedule - the kaarigar proposes a new time. */
bookingsRouter.post('/:id/reschedule', async (req: Request, res: Response) => {
  if (!flagGuard(res) || !dbGuard(res)) return;

  if (!isKaarigar(req)) {
    return res.status(403).json({ error: 'kaarigar_only', message: 'Only the kaarigar can propose a new time.' });
  }

  try {
    const doc = await loadParticipantBooking(req, res);
    if (!doc) return;
    if (doc.kaarigarId !== req.user!.uid) {
      return res.status(404).json({ error: 'booking_not_found', message: 'No such booking for this user.' });
    }

    const slotStart = slotFrom(req.body?.slotStart);
    const slotEnd = slotFrom(req.body?.slotEnd);
    if (!Number.isFinite(slotStart) || !Number.isFinite(slotEnd)) {
      return res.status(400).json({
        error: 'slot_required',
        field: 'slotStart',
        message: 'A new time needs a start and an end.',
      });
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 280) : undefined;
    const result = await requestReschedule(String(doc._id), slotStart, slotEnd, reason || undefined);
    if (!result.ok) {
      const refusal = refusalFor(result);
      return res.status(refusal.status).json(refusal.body);
    }

    return res.json({ booking: result.booking });
  } catch (err) {
    console.error('[bookings] POST /:id/reschedule failed:', err);
    return res.status(500).json({ error: 'reschedule_failed', message: 'Could not propose a new time.' });
  }
});

/**
 * POST /api/bookings/:id/reschedule/respond - the customer answers.
 *
 * `approve` must be a real boolean. Coercing a missing field to false would
 * turn a malformed request into a silent rejection of the kaarigar's proposal,
 * and the kaarigar would never know the customer had not actually been asked.
 */
bookingsRouter.post('/:id/reschedule/respond', async (req: Request, res: Response) => {
  if (!flagGuard(res) || !dbGuard(res)) return;

  if (!isCustomer(req)) {
    return res.status(403).json({ error: 'customer_only', message: 'Only the customer can answer a proposed time.' });
  }
  if (typeof req.body?.approve !== 'boolean') {
    return res.status(400).json({
      error: 'invalid_field',
      field: 'approve',
      message: 'approve must be true or false.',
    });
  }

  try {
    const doc = await loadParticipantBooking(req, res);
    if (!doc) return;
    if (doc.customerId !== req.user!.uid) {
      return res.status(404).json({ error: 'booking_not_found', message: 'No such booking for this user.' });
    }

    const result = await respondReschedule(String(doc._id), req.body.approve === true);
    if (!result.ok) {
      const refusal = refusalFor(result);
      return res.status(refusal.status).json(refusal.body);
    }

    return res.json({ booking: result.booking });
  } catch (err) {
    console.error('[bookings] POST /:id/reschedule/respond failed:', err);
    return res.status(500).json({ error: 'reschedule_answer_failed', message: 'Could not record your answer.' });
  }
});

/**
 * POST /api/bookings/:id/report-no-arrival - the customer says nobody came.
 *
 * Reads NOTHING from the body. No reason, no amount, no evidence - the same
 * shape as the existing confirm and dispute routes. The claim is "the agreed
 * time passed and nobody arrived", and the server already knows the time; there
 * is nothing for the customer to add that would not simply be unverifiable.
 *
 * Refused before arriveBy, so impatience cannot mark someone late early.
 */
bookingsRouter.post('/:id/report-no-arrival', async (req: Request, res: Response) => {
  if (!flagGuard(res) || !dbGuard(res)) return;

  if (!isCustomer(req)) {
    return res.status(403).json({ error: 'customer_only', message: 'Only the customer can report a missed visit.' });
  }

  try {
    const doc = await loadParticipantBooking(req, res);
    if (!doc) return;
    if (doc.customerId !== req.user!.uid) {
      return res.status(404).json({ error: 'booking_not_found', message: 'No such booking for this user.' });
    }

    const result = await reportNoArrival(String(doc._id));
    if (!result.ok) {
      const refusal = refusalFor(result);
      return res.status(refusal.status).json(refusal.body);
    }

    return res.json({ booking: result.booking });
  } catch (err) {
    console.error('[bookings] POST /:id/report-no-arrival failed:', err);
    return res.status(500).json({ error: 'report_failed', message: 'Could not record the report.' });
  }
});
