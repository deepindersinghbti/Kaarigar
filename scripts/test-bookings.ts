/**
 * Booking lifecycle and reliability scoring.
 *
 * Uses a UNIQUELY NAMED THROWAWAY DATABASE, never the saved demo one, and drops
 * it on the way out. Same pattern as scripts/test-customer-demo.ts, and for the
 * same reason: a suite that can touch kaarigar_sih_demo is one typo away from
 * dropping jobs with outstanding review links.
 *
 * NO IN-MEMORY MONGO. mongodb-memory-server is not installed and the brief
 * forbids new dependencies, so this runs against the real driver with a
 * disposable database name - which also means the atomicity and unique-index
 * behaviour being tested is the real thing rather than an emulation of it.
 *
 * TIME IS INJECTED, NEVER SLEPT. Every transition takes `now` as a parameter,
 * so a 24-hour no-show is tested by passing a number, not by waiting. There is
 * not a single setTimeout in this file.
 *
 *   npx tsx scripts/test-bookings.ts
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const databaseName = `kg_book_test_${Date.now()}_${randomBytes(3).toString('hex')}`;
process.env.MONGODB_DB_NAME = databaseName;
process.env.CHECKIN_OTP_SECRET = randomBytes(48).toString('hex');
process.env.NODE_ENV = 'development';
// Pin every window so a stray .env cannot change what the assertions mean.
process.env.ACCEPT_WINDOW_URGENT_MIN = '30';
process.env.ACCEPT_WINDOW_NORMAL_MIN = '240';
process.env.SCHEDULE_WINDOW_MIN = '1440';
process.env.ARRIVAL_GRACE_MIN = '60';
process.env.NO_SHOW_AFTER_MIN = '1440';
process.env.RESCHEDULE_MIN_NOTICE_H = '12';
process.env.LATE_CANCEL_NOTICE_H = '12';
process.env.MAX_RESCHEDULES = '1';
process.env.CHECKIN_OTP_MAX_ATTEMPTS = '5';
process.env.CHECKIN_LOCK_MIN = '15';

import { connectDb, closeDb, getDb } from '../src/server/db';
import { createJob, JOBS } from '../src/server/data/jobs';
import { BOOKINGS, createBooking, findBookingDoc, shapeBooking } from '../src/server/data/bookings';
import { RELIABILITY_EVENTS, statsFor } from '../src/server/data/reliability';
import {
  computeReliability,
  reliabilityRecord,
  responseRate,
} from '../src/server/lib/reliabilityScore';
import { hashCheckinOtp } from '../src/server/lib/checkinOtp';
import {
  applyOverdue,
  armScheduleDeadline,
  cancel,
  checkin,
  commitSlot,
  complete,
  decline,
  markResponded,
  reportNoArrival,
  requestReschedule,
  respondReschedule,
} from '../src/server/bookings/transitions';
import type { ReliabilityEventType } from '../src/types';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${passed + failed}: ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.error(`FAIL ${passed + failed}: ${label}`);
  }
}

function near(actual: number, expected: number, tolerance = 1e-9): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

const db = await connectDb();
assert.ok(db, 'Test database must connect - check MONGODB_URI and the Atlas allowlist.');
assert.equal(db.databaseName, databaseName, 'Refusing to run against a database this test did not name.');
console.log(`\n[test] database: ${databaseName}\n`);

const T0 = Date.UTC(2026, 8, 16, 9, 0, 0);
let seq = 0;

/** A customer-linked job plus its booking, in REQUESTED. */
async function seed(options: { urgent?: boolean; now?: number } = {}) {
  seq += 1;
  const now = options.now ?? T0;
  const customerId = `cust-${seq}`;
  const kaarigarId = `kaar-${seq}`;

  const outcome = await createJob(kaarigarId, { title: `Job ${seq}`, amount: 500 }, { actorId: customerId, customerId });
  assert.equal(outcome.status, 'created');
  const jobId = outcome.status === 'created' ? outcome.job.id : '';

  const booking = await createBooking(
    { jobId, customerId, kaarigarId, jobTitle: `Job ${seq}`, urgent: Boolean(options.urgent) },
    now
  );
  return { bookingId: String(booking._id), jobId, customerId, kaarigarId, now };
}

/**
 * Drive the JOB to a state the routes would have put it in.
 *
 * Phase 2b deliberately does not touch routes/jobs.ts, so the job side of the
 * flow is simulated here. Phase 2c replaces these two lines with the real
 * transition route and the assertions should not change.
 */
async function setJobState(jobId: string, status: string): Promise<void> {
  await getDb().collection(JOBS).updateOne({ _id: jobId as never }, { $set: { status } });
}

async function jobStatus(jobId: string): Promise<string> {
  const doc = await getDb().collection(JOBS).findOne({ _id: jobId as never });
  return String(doc?.status ?? '');
}

async function eventTypes(bookingId: string): Promise<ReliabilityEventType[]> {
  const docs = await getDb().collection(RELIABILITY_EVENTS).find({ bookingId }).toArray();
  return docs.map((d) => d.type as ReliabilityEventType).sort();
}

/** Read the stored OTP hash and brute-force the 4 digits, as the customer's screen would know them. */
async function otpFor(bookingId: string): Promise<string> {
  const doc = await findBookingDoc(bookingId);
  assert.ok(doc?.otpHash, 'booking should have an OTP hash');
  for (let i = 0; i < 10_000; i += 1) {
    const candidate = String(i).padStart(4, '0');
    if (hashCheckinOtp(candidate, bookingId) === doc.otpHash) return candidate;
  }
  throw new Error('could not recover the OTP');
}

try {
  // =========================================================================
  console.log('\n--- Scoring (pure) ---\n');
  // =========================================================================

  check('no events returns the 0.8 prior', near(computeReliability([], T0), 0.8));

  const oneNoShowToday = computeReliability([{ type: 'NO_SHOW', at: T0 }], T0);
  check('one NO_SHOW today lowers the score noticeably', oneNoShowToday < 0.6);
  check('one NO_SHOW today does not zero the score', oneNoShowToday > 0.3);
  check('one NO_SHOW today is exactly 0.5', near(oneNoShowToday, 0.5));

  const oldNoShow = computeReliability([{ type: 'NO_SHOW', at: T0 - 180 * DAY }], T0);
  check('a 180-day-old NO_SHOW has little effect', oldNoShow > 0.75 && oldNoShow < 0.8);

  const manyBad = computeReliability(
    Array.from({ length: 50 }, () => ({ type: 'NO_SHOW' as const, at: T0 })),
    T0
  );
  const manyGood = computeReliability(
    Array.from({ length: 50 }, () => ({ type: 'ON_TIME' as const, at: T0 })),
    T0
  );
  check('the score is clamped at or above 0', manyBad >= 0);
  check('the score is clamped at or below 1', manyGood <= 1);

  check('EXPIRED has zero weight', near(computeReliability([{ type: 'EXPIRED', at: T0 }], T0), 0.8));

  // The three worked examples from §9.5.
  check('reliabilityRecord: new worker = 0', reliabilityRecord(computeReliability([], T0)) === 0);
  check('reliabilityRecord: one NO_SHOW today = -4', reliabilityRecord(oneNoShowToday) === -4);
  check('reliabilityRecord: one NO_SHOW 180 days ago = 0', reliabilityRecord(oldNoShow) === 0);
  check('reliabilityRecord never exceeds 0 for a clean record', reliabilityRecord(1) === 0);
  check('reliabilityRecord floors at -10', reliabilityRecord(0) === -10);

  check('responseRate with nothing to judge is 1', responseRate(0, 0, 0) === 1);
  check('responseRate counts expiries against the worker', near(responseRate(1, 0, 1), 0.5));
  // A prompt "no" is an answer. Only silence may lower this number.
  check('a prompt decline does not lower responseRate', responseRate(0, 3, 0) === 1);
  check('declines and accepts both count as answers', near(responseRate(1, 1, 2), 0.5));
  check('only silence lowers responseRate', responseRate(0, 0, 2) === 0);

  // =========================================================================
  console.log('\n--- Expiry and lateness ---\n');
  // =========================================================================

  {
    const s = await seed();
    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 5 * HOUR);
    check('a normal request expires after acceptBy', swept.expired === 1);

    const doc = await findBookingDoc(s.bookingId);
    check('the expired booking is EXPIRED', doc?.status === 'EXPIRED');
    check('expiry writes exactly one EXPIRED event', (await eventTypes(s.bookingId)).join() === 'EXPIRED');
    check('expiry cancels the linked job', (await jobStatus(s.jobId)) === 'CANCELLED');

    const late = await markResponded(s.bookingId, T0 + 5 * HOUR);
    check('answering after expiry is refused', !late.ok && late.reason === 'wrong_state');
  }

  {
    const s = await seed({ urgent: true });
    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 20 * MIN);
    check('an urgent request has not expired at 20 minutes', swept.expired === 0);
    const swept2 = await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 31 * MIN);
    check('an urgent request expires at 31 minutes', swept2.expired === 1);
  }

  {
    const s = await seed();
    check('responding inside the window succeeds', (await markResponded(s.bookingId, T0 + MIN)).ok);

    const slotStart = T0 + 2 * DAY;
    const committed = await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    check('committing a slot succeeds', committed.ok);

    const doc = await findBookingDoc(s.bookingId);
    check('the booking is COMMITTED', doc?.status === 'COMMITTED');
    check('arriveBy is slotEnd + grace', doc?.arriveBy?.getTime() === slotStart + 2 * HOUR + 60 * MIN);
    check('scheduleBy is removed, not nulled', doc !== null && !('scheduleBy' in doc));

    const arriveBy = slotStart + 2 * HOUR + 60 * MIN;
    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + MIN);
    check('COMMITTED becomes LATE after arriveBy', swept.late === 1);
    check('going late writes one LATE event', (await eventTypes(s.bookingId)).join() === 'LATE');
    check('going late does NOT cancel the job', (await jobStatus(s.jobId)) !== 'CANCELLED');

    const code = await otpFor(s.bookingId);
    const arrived = await checkin(s.bookingId, code, arriveBy + 2 * MIN);
    check('a late check-in still reaches ARRIVED', arrived.ok);
    check('a late check-in writes NO ON_TIME event', (await eventTypes(s.bookingId)).join() === 'LATE');
  }

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    const arriveBy = slotStart + 2 * HOUR + 60 * MIN;

    await applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + MIN);
    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + 25 * HOUR);
    check('LATE becomes NO_SHOW after 24 hours', swept.noShow === 1);
    check('LATE then NO_SHOW keeps both events', (await eventTypes(s.bookingId)).join() === 'LATE,NO_SHOW');

    const noShowRows = await getDb()
      .collection(RELIABILITY_EVENTS)
      .countDocuments({ bookingId: s.bookingId, type: 'NO_SHOW' });
    check('exactly one NO_SHOW event exists', noShowRows === 1);
    check('a no-show cancels the job', (await jobStatus(s.jobId)) === 'CANCELLED');
  }

  {
    // One pass over a long-abandoned booking must produce BOTH events.
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    const arriveBy = slotStart + 2 * HOUR + 60 * MIN;

    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + 30 * HOUR);
    check('one sweep walks COMMITTED -> LATE -> NO_SHOW', swept.late === 1 && swept.noShow === 1);
    check('and leaves both events behind', (await eventTypes(s.bookingId)).join() === 'LATE,NO_SHOW');
  }

  // =========================================================================
  console.log('\n--- Check-in ---\n');
  // =========================================================================

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);

    const code = await otpFor(s.bookingId);
    const arrived = await checkin(s.bookingId, code, slotStart + 30 * MIN);
    check('an on-time check-in reaches ARRIVED', arrived.ok);
    check('an on-time check-in writes exactly one ON_TIME', (await eventTypes(s.bookingId)).join() === 'ON_TIME');

    const done = await complete(s.bookingId, 'kaarigar', slotStart + 90 * MIN);
    check('ARRIVED completes', done.ok && done.booking.status === 'COMPLETED');
    check('completing writes no further event', (await eventTypes(s.bookingId)).join() === 'ON_TIME');
  }

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    const real = await otpFor(s.bookingId);
    const wrong = real === '0000' ? '1111' : '0000';

    let lockedAt = 0;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await checkin(s.bookingId, wrong, slotStart + attempt * MIN);
      if (!result.ok && result.reason === 'otp_locked') lockedAt = attempt;
    }
    check('five wrong codes lock check-in', lockedAt === 5);

    const blocked = await checkin(s.bookingId, real, slotStart + 6 * MIN);
    check('the correct code is refused while locked', !blocked.ok && blocked.reason === 'otp_locked');

    const afterLock = await checkin(s.bookingId, real, slotStart + 20 * MIN);
    check('the correct code works once the lock expires', afterLock.ok);
  }

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    const committed = await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    check('commitSlot returns the plain code exactly once', committed.ok && typeof committed.otp === 'string');

    const doc = await findBookingDoc(s.bookingId);
    const shaped = shapeBooking(doc!) as unknown as Record<string, unknown>;
    check('a shaped booking carries no otpHash', !('otpHash' in shaped));
    check('a shaped booking carries no otpAttempts', !('otpAttempts' in shaped));
    check('a shaped booking carries no otpLockedUntil', !('otpLockedUntil' in shaped));
    check('a shaped booking carries no plain otp', !('otp' in shaped));
    check('JSON of a shaped booking mentions no otp at all', !/otp/i.test(JSON.stringify(shaped)));
  }

  // =========================================================================
  console.log('\n--- Slot validation ---\n');
  // =========================================================================

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const at = T0 + 2 * MIN;

    const past = await commitSlot(s.bookingId, at - HOUR, at + HOUR, at);
    check('a slot in the past is refused', !past.ok && past.reason === 'slot_in_past');

    const backwards = await commitSlot(s.bookingId, at + 2 * HOUR, at + HOUR, at);
    check('a slot that ends before it starts is refused', !backwards.ok && backwards.reason === 'slot_order');

    const tooLong = await commitSlot(s.bookingId, at + HOUR, at + 14 * HOUR, at);
    check('a slot longer than 12 hours is refused', !tooLong.ok && tooLong.reason === 'slot_too_long');

    const tooFar = await commitSlot(s.bookingId, at + 20 * DAY, at + 20 * DAY + HOUR, at);
    check('a slot more than 14 days ahead is refused', !tooFar.ok && tooFar.reason === 'slot_too_far');

    const doc = await findBookingDoc(s.bookingId);
    check('a refused slot leaves the booking in RESPONDED', doc?.status === 'RESPONDED');
    check('a refused slot mints no OTP', !doc?.otpHash);
  }

  // =========================================================================
  console.log('\n--- Reschedule ---\n');
  // =========================================================================

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);

    const tooLate = await requestReschedule(s.bookingId, slotStart + 3 * DAY, slotStart + 3 * DAY + HOUR, undefined, slotStart - 6 * HOUR);
    check('a reschedule with less than 12 hours notice is refused', !tooLate.ok && tooLate.reason === 'reschedule_notice');

    const first = await requestReschedule(s.bookingId, slotStart + 3 * DAY, slotStart + 3 * DAY + HOUR, 'van broke down', T0 + HOUR);
    check('a reschedule with enough notice is accepted', first.ok);
    check('the proposal is pending, not applied', first.ok && first.booking.pendingReschedule !== undefined);
    check('the original slot still stands while pending', first.ok && first.booking.slotStart === new Date(slotStart).toISOString());

    const approved = await respondReschedule(s.bookingId, true, T0 + 2 * HOUR);
    check('the customer can approve a new time', approved.ok);
    check('approval moves the slot', approved.ok && approved.booking.slotStart === new Date(slotStart + 3 * DAY).toISOString());
    check('approval recomputes arriveBy', approved.ok && approved.booking.arriveBy === new Date(slotStart + 3 * DAY + HOUR + 60 * MIN).toISOString());
    check('approval clears the pending proposal', approved.ok && approved.booking.pendingReschedule === undefined);
    check('the booking is still COMMITTED', approved.ok && approved.booking.status === 'COMMITTED');
    check('a reschedule writes no event', (await eventTypes(s.bookingId)).length === 0);

    const second = await requestReschedule(s.bookingId, slotStart + 5 * DAY, slotStart + 5 * DAY + HOUR, undefined, T0 + 3 * HOUR);
    check('a second reschedule is refused', !second.ok && second.reason === 'reschedule_limit');
  }

  {
    // The OTP must survive a reschedule - the customer may already have it written down.
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    const before = await otpFor(s.bookingId);

    await requestReschedule(s.bookingId, slotStart + 3 * DAY, slotStart + 3 * DAY + HOUR, undefined, T0 + HOUR);
    await respondReschedule(s.bookingId, true, T0 + 2 * HOUR);
    check('the arrival code is unchanged by a reschedule', (await otpFor(s.bookingId)) === before);
  }

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);

    await requestReschedule(s.bookingId, slotStart + 3 * DAY, slotStart + 3 * DAY + HOUR, undefined, T0 + HOUR);
    const rejected = await respondReschedule(s.bookingId, false, T0 + 2 * HOUR);
    check('the customer can reject a new time', rejected.ok);
    check('rejection keeps the original slot', rejected.ok && rejected.booking.slotStart === new Date(slotStart).toISOString());
    check('rejection clears the proposal', rejected.ok && rejected.booking.pendingReschedule === undefined);

    const again = await requestReschedule(s.bookingId, slotStart + 4 * DAY, slotStart + 4 * DAY + HOUR, undefined, T0 + 3 * HOUR);
    check('a rejected proposal still spends the reschedule allowance', !again.ok && again.reason === 'reschedule_limit');
  }

  // =========================================================================
  console.log('\n--- Cancel ---\n');
  // =========================================================================

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);

    const result = await cancel(s.bookingId, 'kaarigar', slotStart - 2 * HOUR);
    check('a late kaarigar cancel succeeds', result.ok);
    check('a late kaarigar cancel writes LATE_CANCEL', (await eventTypes(s.bookingId)).join() === 'LATE_CANCEL');
    check('the booking is CANCELLED_BY_KAARIGAR', result.ok && result.booking.status === 'CANCELLED_BY_KAARIGAR');
  }

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 5 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);

    const result = await cancel(s.bookingId, 'kaarigar', slotStart - 3 * DAY);
    check('a kaarigar cancel with ample notice succeeds', result.ok);
    check('a kaarigar cancel with ample notice writes nothing', (await eventTypes(s.bookingId)).length === 0);
  }

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);

    const result = await cancel(s.bookingId, 'customer', slotStart - MIN);
    check('a customer cancel succeeds', result.ok);
    check('a customer cancel writes nothing, even at the last minute', (await eventTypes(s.bookingId)).length === 0);
    check('the booking is CANCELLED_BY_CUSTOMER', result.ok && result.booking.status === 'CANCELLED_BY_CUSTOMER');
  }

  {
    const s = await seed();
    const result = await cancel(s.bookingId, 'kaarigar', T0 + MIN);
    check('a kaarigar cancel before any slot writes nothing', result.ok && (await eventTypes(s.bookingId)).length === 0);
  }

  {
    // LATE then kaarigar cancel => LATE + NO_SHOW, never LATE_CANCEL.
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    const arriveBy = slotStart + 2 * HOUR + 60 * MIN;
    await applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + MIN);

    const result = await cancel(s.bookingId, 'kaarigar', arriveBy + 2 * HOUR);
    check('cancelling out of LATE succeeds', result.ok);
    check('cancelling out of LATE lands in NO_SHOW', result.ok && result.booking.status === 'NO_SHOW');
    const types = await eventTypes(s.bookingId);
    check('LATE then kaarigar cancel = exactly LATE + NO_SHOW', types.join() === 'LATE,NO_SHOW');
    check('LATE then kaarigar cancel writes NO LATE_CANCEL', !types.includes('LATE_CANCEL'));
    check('cancelling out of LATE cancels the job', (await jobStatus(s.jobId)) === 'CANCELLED');
  }

  {
    // LATE then customer cancel => LATE + NO_SHOW against the kaarigar.
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    const arriveBy = slotStart + 2 * HOUR + 60 * MIN;
    await applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + MIN);

    const result = await cancel(s.bookingId, 'customer', arriveBy + 3 * HOUR);
    check('a customer giving up on a late kaarigar lands in NO_SHOW', result.ok && result.booking.status === 'NO_SHOW');
    const types = await eventTypes(s.bookingId);
    check('LATE then customer cancel = exactly LATE + NO_SHOW', types.join() === 'LATE,NO_SHOW');
    check('LATE then customer cancel writes no LATE_CANCEL', !types.includes('LATE_CANCEL'));
  }

  // =========================================================================
  console.log('\n--- The schedule deadline ---\n');
  // =========================================================================

  {
    // Price agreed, no slot ever chosen.
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    await setJobState(s.jobId, 'ACCEPTED');
    check('arming the schedule deadline succeeds', (await armScheduleDeadline(s.bookingId, T0 + 2 * MIN)).ok);

    const early = await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 12 * HOUR);
    check('the schedule deadline has not passed at 12 hours', early.scheduleExpired === 0);

    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 25 * HOUR);
    check('an agreed job with no slot expires after 24 hours', swept.scheduleExpired === 1);

    const doc = await findBookingDoc(s.bookingId);
    check('the booking is EXPIRED', doc?.status === 'EXPIRED');
    check('the schedule expiry writes LATE_CANCEL, not EXPIRED', (await eventTypes(s.bookingId)).join() === 'LATE_CANCEL');
    check('the schedule expiry cancels the job', (await jobStatus(s.jobId)) === 'CANCELLED');
  }

  {
    // Waiting on the customer: quoted, never agreed. Nothing must expire.
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    await setJobState(s.jobId, 'QUOTED');

    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 30 * DAY);
    check('a quoted job never expires, even after 30 days', swept.expired === 0 && swept.scheduleExpired === 0);

    const doc = await findBookingDoc(s.bookingId);
    check('it is still RESPONDED', doc?.status === 'RESPONDED');
    check('it has no scheduleBy to expire against', doc !== null && !('scheduleBy' in doc));
    check('and no events were written', (await eventTypes(s.bookingId)).length === 0);
  }

  {
    // A counter-offer sends the job back to REQUESTED. Still no deadline.
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    await setJobState(s.jobId, 'REQUESTED');
    await getDb().collection(JOBS).updateOne({ _id: s.jobId as never }, { $set: { counterPrice: 900 } });

    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 30 * DAY);
    check('a counter pending never expires', swept.expired === 0 && swept.scheduleExpired === 0);
    check('the booking stays RESPONDED through a counter', (await findBookingDoc(s.bookingId))?.status === 'RESPONDED');
  }

  {
    // A RESPONDED booking must never be swept to LATE, whatever else is true.
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    await armScheduleDeadline(s.bookingId, T0 + 2 * MIN);

    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 25 * HOUR);
    check('a RESPONDED booking is never swept to LATE', swept.late === 0);
    check('it expires on the schedule rule instead', swept.scheduleExpired === 1);
    check('and the resulting status is EXPIRED, not LATE', (await findBookingDoc(s.bookingId))?.status === 'EXPIRED');
  }

  {
    // Defence in depth: even a hand-nulled arriveBy must not make it a candidate.
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    await getDb().collection(BOOKINGS).updateOne({ _id: s.bookingId as never }, { $set: { arriveBy: null } });

    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 25 * HOUR);
    check('a nulled arriveBy on a RESPONDED booking is still not LATE', swept.late === 0);
  }

  // =========================================================================
  console.log('\n--- Unanswered reschedule proposals (sweep rule 0) ---\n');
  // =========================================================================

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    const arriveBy = slotStart + 2 * HOUR + 60 * MIN;

    await requestReschedule(s.bookingId, slotStart + 3 * DAY, slotStart + 3 * DAY + HOUR, 'van broke down', T0 + HOUR);

    // The customer says nothing at all.
    const early = await applyOverdue({ kaarigarId: s.kaarigarId }, slotStart - HOUR);
    check('a pending proposal is left alone before the original slot', early.rescheduleAutoRejected === 0);
    check('and is still pending', (await findBookingDoc(s.bookingId))?.pendingReschedule !== undefined);

    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, slotStart);
    check('an unanswered proposal is auto-rejected at the original slot', swept.rescheduleAutoRejected === 1);

    const doc = await findBookingDoc(s.bookingId);
    check('the original slot stands', doc?.slotStart?.getTime() === slotStart);
    check('arriveBy is unchanged', doc?.arriveBy?.getTime() === arriveBy);
    check('the proposal is cleared, not nulled', doc !== null && !('pendingReschedule' in doc));
    check('rescheduleCount stays spent', doc?.rescheduleCount === 1);
    check('the booking is still COMMITTED', doc?.status === 'COMMITTED');
    check('auto-rejection writes no event', (await eventTypes(s.bookingId)).length === 0);
    check('auto-rejection is recorded in history', (doc?.history ?? []).some((h) => h.note === 'new time not answered before the original slot'));

    const again = await requestReschedule(s.bookingId, slotStart + 5 * DAY, slotStart + 5 * DAY + HOUR, undefined, slotStart + MIN);
    check('the spent allowance is not refunded by auto-rejection', !again.ok && again.reason === 'reschedule_limit');

    const repeat = await applyOverdue({ kaarigarId: s.kaarigarId }, slotStart + MIN);
    check('auto-rejection is idempotent', repeat.rescheduleAutoRejected === 0);

    // ...and the ordinary lateness path is completely unaffected afterwards.
    const late = await applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + MIN);
    check('the normal LATE path still runs after an auto-rejection', late.late === 1);
    check('and writes exactly one LATE event', (await eventTypes(s.bookingId)).join() === 'LATE');

    const noShow = await applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + 25 * HOUR);
    check('and NO_SHOW follows normally', noShow.noShow === 1);
    check('leaving LATE + NO_SHOW', (await eventTypes(s.bookingId)).join() === 'LATE,NO_SHOW');
  }

  {
    // One pass must close the proposal AND apply lateness, in that order.
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    const arriveBy = slotStart + 2 * HOUR + 60 * MIN;
    await requestReschedule(s.bookingId, slotStart + 3 * DAY, slotStart + 3 * DAY + HOUR, undefined, T0 + HOUR);

    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + MIN);
    check('one pass auto-rejects and marks late together', swept.rescheduleAutoRejected === 1 && swept.late === 1);
    check('lateness is measured against the ORIGINAL slot', (await eventTypes(s.bookingId)).join() === 'LATE');
  }

  {
    // An answered proposal is never touched by rule 0.
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    await requestReschedule(s.bookingId, slotStart + 3 * DAY, slotStart + 3 * DAY + HOUR, undefined, T0 + HOUR);
    await respondReschedule(s.bookingId, true, T0 + 2 * HOUR);

    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, slotStart + HOUR);
    check('an approved reschedule is not auto-rejected at the old slot', swept.rescheduleAutoRejected === 0);
    check('and the booking is not late against the new slot', swept.late === 0);
    check('the new slot stands', (await findBookingDoc(s.bookingId))?.slotStart?.getTime() === slotStart + 3 * DAY);
  }

  // =========================================================================
  console.log('\n--- Customer-reported non-arrival ---\n');
  // =========================================================================

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    const arriveBy = slotStart + 2 * HOUR + 60 * MIN;

    const tooEarly = await reportNoArrival(s.bookingId, arriveBy - HOUR);
    check('report-no-arrival before arriveBy is refused', !tooEarly.ok && tooEarly.reason === 'too_early');
    check('and writes nothing', (await eventTypes(s.bookingId)).length === 0);

    const reported = await reportNoArrival(s.bookingId, arriveBy + MIN);
    check('report-no-arrival after arriveBy succeeds', reported.ok && reported.booking.status === 'LATE');
    check('it writes exactly one LATE event', (await eventTypes(s.bookingId)).join() === 'LATE');
    check('it does NOT cancel the job', (await jobStatus(s.jobId)) !== 'CANCELLED');

    const swept = await applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + 2 * MIN);
    check('the sweeper does not double-report the same lateness', swept.late === 0);
    check('and there is still exactly one LATE event', (await eventTypes(s.bookingId)).join() === 'LATE');
  }

  // =========================================================================
  console.log('\n--- Concurrency and idempotency ---\n');
  // =========================================================================

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    const arriveBy = slotStart + 2 * HOUR + 60 * MIN;

    const [a, b] = await Promise.all([
      applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + 30 * HOUR),
      applyOverdue({ kaarigarId: s.kaarigarId }, arriveBy + 30 * HOUR),
    ]);
    check('two concurrent sweeps move the booking once', a.late + b.late === 1);
    check('two concurrent sweeps produce one NO_SHOW move', a.noShow + b.noShow === 1);

    const rows = await getDb().collection(RELIABILITY_EVENTS).find({ bookingId: s.bookingId }).toArray();
    check('two concurrent sweeps write exactly two events', rows.length === 2);
    check('each event type appears exactly once', (await eventTypes(s.bookingId)).join() === 'LATE,NO_SHOW');
  }

  {
    const s = await seed();
    const first = await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 5 * HOUR);
    const second = await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 5 * HOUR);
    check('the first sweep reports work done', first.expired === 1);
    check('an immediately repeated sweep is a no-op', second.expired === 0 && second.late === 0 && second.noShow === 0);
    check('and no duplicate event was written', (await eventTypes(s.bookingId)).join() === 'EXPIRED');
  }

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    const code = await otpFor(s.bookingId);

    const [a, b] = await Promise.all([
      checkin(s.bookingId, code, slotStart + 30 * MIN),
      checkin(s.bookingId, code, slotStart + 30 * MIN),
    ]);
    check('two concurrent check-ins: exactly one wins', [a.ok, b.ok].filter(Boolean).length === 1);
    check('and exactly one ON_TIME event exists', (await eventTypes(s.bookingId)).join() === 'ON_TIME');
  }

  // =========================================================================
  console.log('\n--- State guards ---\n');
  // =========================================================================

  {
    const s = await seed();
    check('a new request can be declined', (await decline(s.bookingId, T0 + MIN)).ok);
    const doc = await findBookingDoc(s.bookingId);
    check('declining lands in DECLINED', doc?.status === 'DECLINED');
    check('declining writes no event', (await eventTypes(s.bookingId)).length === 0);

    const again = await cancel(s.bookingId, 'kaarigar', T0 + 2 * MIN);
    check('a terminal booking cannot be cancelled', !again.ok && again.reason === 'terminal');
    const reDecline = await decline(s.bookingId, T0 + 2 * MIN);
    check('a declined booking cannot be declined twice', !reDecline.ok);
  }

  {
    const s = await seed();
    const early = await commitSlot(s.bookingId, T0 + 2 * DAY, T0 + 2 * DAY + HOUR, T0 + MIN);
    check('a slot cannot be set before the kaarigar has responded', !early.ok && early.reason === 'wrong_state');

    const noCheckin = await checkin(s.bookingId, '0000', T0 + MIN);
    check('a REQUESTED booking cannot be checked in to', !noCheckin.ok && noCheckin.reason === 'wrong_state');

    const noComplete = await complete(s.bookingId, 'kaarigar', T0 + MIN);
    check('a REQUESTED booking cannot be completed', !noComplete.ok && noComplete.reason === 'wrong_state');
  }

  // =========================================================================
  console.log('\n--- Aggregate stats ---\n');
  // =========================================================================

  {
    const s = await seed();
    const stats = await statsFor(s.kaarigarId, T0);
    check('a new kaarigar starts at the 0.8 prior', near(stats.reliability, 0.8));
    check('a new kaarigar has no reviews', stats.reviewCount === 0);
    check('a new kaarigar has no on-time count', stats.onTime === 0);
    check('the deprecated trustScore is not computed', stats.trustScore === 0);
    check('an unanswered request is pending, not yet counted against responseRate', stats.responseRate === 1);

    await applyOverdue({ kaarigarId: s.kaarigarId }, T0 + 5 * HOUR);
    const after = await statsFor(s.kaarigarId, T0 + 5 * HOUR);
    check('an expiry lowers responseRate', after.responseRate === 0);
    check('an expiry does not move reliability', near(after.reliability, 0.8));
    check('and reliabilityRecord stays 0 for an expiry', reliabilityRecord(after.reliability) === 0);
  }

  {
    const s = await seed();
    await markResponded(s.bookingId, T0 + MIN);
    const slotStart = T0 + 2 * DAY;
    await commitSlot(s.bookingId, slotStart, slotStart + 2 * HOUR, T0 + 2 * MIN);
    await checkin(s.bookingId, await otpFor(s.bookingId), slotStart + 30 * MIN);

    const stats = await statsFor(s.kaarigarId, slotStart + HOUR);
    check('a clean visit counts as on-time', stats.onTime === 1);
    check('a clean visit raises reliability above the prior', stats.reliability > 0.8);
    check('a responded request gives a full responseRate', stats.responseRate === 1);
    check('reliabilityRecord stays 0 for a good record', reliabilityRecord(stats.reliability) === 0);
  }
} finally {
  console.log('\n--- Cleanup ---\n');
  try {
    await getDb().dropDatabase();
    console.log(`[test] dropped ${databaseName}`);
  } catch (err) {
    console.error('[test] could not drop the test database:', err);
  }
  await closeDb();
}

console.log(`\n${'='.repeat(52)}`);
console.log(`  passed: ${passed}    failed: ${failed}    total: ${passed + failed}`);
console.log(`${'='.repeat(52)}\n`);
if (failed > 0) {
  for (const label of failures) console.error(`  FAILED: ${label}`);
  process.exit(1);
}
