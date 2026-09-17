/**
 * Route-level booking tests, over real HTTP, with BOOKINGS_ENABLED=true.
 *
 * The transition suite (scripts/test-bookings.ts) proves the state machine.
 * This one proves the WIRING: that the gates actually reach the routes both
 * roles already use, that the arrival code never appears in a kaarigar-facing
 * response, and - the case that matters most for not breaking the demo - that a
 * job with no booking still walks the old one-tap path with no slot and no code.
 *
 * Throwaway database, dropped on exit. Time is server-real here rather than
 * injected, so every slot is placed comfortably in the future; the clock-driven
 * cases live in the transition suite where time can be controlled.
 *
 *   npx tsx scripts/test-booking-routes.ts
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express from 'express';

const databaseName = `kg_broutes_test_${Date.now()}_${randomBytes(3).toString('hex')}`;
process.env.MONGODB_DB_NAME = databaseName;
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.CHECKIN_OTP_SECRET = randomBytes(48).toString('hex');
process.env.NODE_ENV = 'development';
process.env.BOOKINGS_ENABLED = 'true';

import { connectDb, closeDb, getDb } from '../src/server/db';
import { registerRoutes } from '../src/server/routes';
import { signAccessToken } from '../src/server/auth/tokens';
import { PROFILES } from '../src/server/data/profiles';
import { uuidv7 } from '../src/lib/ids';

const HOUR = 3_600_000;

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

const db = await connectDb();
assert.ok(db, 'Test database must connect.');
assert.equal(db.databaseName, databaseName, 'Refusing to run against a database this test did not name.');

const app = express();
app.use(express.json());
registerRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
console.log(`\n[test] ${base}  db=${databaseName}\n`);

async function call(path: string, token = '', body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  return { status: response.status, body: parsed, text };
}

const workerUid = uuidv7();
const customerUid = uuidv7();
const handle = 'ramesh-test';

const workerToken = signAccessToken({ uid: workerUid, phone: '+919876543210', roles: ['kaarigar'] }, 3600);
const customerToken = signAccessToken({ uid: customerUid, phone: '+910123456789', roles: ['customer'] }, 3600);

await getDb().collection(PROFILES).insertOne({
  _id: uuidv7() as never,
  userId: workerUid,
  passportHandle: handle,
  name: 'Ramesh Kumar',
  trade: 'Electrician',
  experienceYears: 8,
  location: 'Chandigarh',
  phone: '+919876543210',
  skills: [],
  certifications: [],
  rating: 4.5,
  totalJobsCount: 0,
  totalEarnings: 0,
  verifiedStatus: 'unverified',
  joinedDate: new Date().toISOString(),
});

function futureSlot(hoursAhead: number, lengthHours = 2) {
  const start = Date.now() + hoursAhead * HOUR;
  return { slotStart: new Date(start).toISOString(), slotEnd: new Date(start + lengthHours * HOUR).toISOString() };
}

try {
  // =========================================================================
  console.log('\n--- The full happy path, over HTTP ---\n');
  // =========================================================================

  const created = await call('/api/customer/jobs', customerToken, {
    kaarigarHandle: handle,
    title: 'Fan not working',
    amount: 500,
    location: 'Sector 22, Chandigarh',
    urgent: false,
  });
  check('a customer can request a kaarigar', created.status === 201);
  const jobId: string = created.body?.job?.id ?? '';
  check('the request has an id', Boolean(jobId));

  const bookingRow = await getDb().collection('bookings').findOne({ jobId });
  check('requesting creates a booking', bookingRow !== null);
  check('the booking starts in REQUESTED', bookingRow?.status === 'REQUESTED');
  check('the booking carries a first-response deadline', bookingRow?.acceptBy instanceof Date);
  const bookingId = String(bookingRow?._id ?? '');

  const quoted = await call(`/api/jobs/${jobId}/transition`, workerToken, { state: 'QUOTED', quotedPrice: 800 });
  check('the kaarigar can quote', quoted.status === 200);
  check('quoting moves the booking to RESPONDED', (await getDb().collection('bookings').findOne({ jobId }))?.status === 'RESPONDED');

  const accepted = await call(`/api/customer/jobs/${jobId}/accept`, customerToken, {});
  check('the customer can accept the price', accepted.status === 200);
  check('accepting the price copies quotedPrice to agreedPrice', accepted.body?.job?.agreedPrice === 800);

  const armed = await getDb().collection('bookings').findOne({ jobId });
  check('accepting the price arms the slot deadline', armed?.scheduleBy instanceof Date);
  check('and the booking is still RESPONDED', armed?.status === 'RESPONDED');

  // --- the gate: SCHEDULED needs a slot ---
  const noSlot = await call(`/api/jobs/${jobId}/transition`, workerToken, { state: 'SCHEDULED' });
  check('scheduling without a slot is refused', noSlot.status === 400);
  check('and names the reason', noSlot.body?.error === 'slot_required');
  check('the job did not move', (await call('/api/jobs', workerToken)).body.jobs.find((j: any) => j.id === jobId)?.status === 'ACCEPTED');

  const past = await call(`/api/jobs/${jobId}/transition`, workerToken, {
    state: 'SCHEDULED',
    slotStart: new Date(Date.now() - HOUR).toISOString(),
    slotEnd: new Date(Date.now() + HOUR).toISOString(),
  });
  check('a slot in the past is refused', past.status === 400 && past.body?.error === 'slot_in_past');

  const tooLong = await call(`/api/jobs/${jobId}/transition`, workerToken, {
    state: 'SCHEDULED',
    ...futureSlot(24, 20),
  });
  check('a slot longer than 12 hours is refused', tooLong.status === 400 && tooLong.body?.error === 'slot_too_long');

  const slot = futureSlot(24);
  const scheduled = await call(`/api/jobs/${jobId}/transition`, workerToken, { state: 'SCHEDULED', ...slot });
  check('scheduling with a valid slot succeeds', scheduled.status === 200);
  check('the job is SCHEDULED', scheduled.body?.job?.status === 'SCHEDULED');

  const committed = await getDb().collection('bookings').findOne({ jobId });
  check('the booking is COMMITTED', committed?.status === 'COMMITTED');
  check('arriveBy is set', committed?.arriveBy instanceof Date);
  check('an arrival code hash was minted', typeof committed?.otpHash === 'string');
  check('scheduleBy was removed, not nulled', committed !== null && !('scheduleBy' in committed));

  // --- the gate: IN_PROGRESS needs the code ---
  const noOtp = await call(`/api/jobs/${jobId}/transition`, workerToken, { state: 'IN_PROGRESS' });
  check('starting work without the code is refused', noOtp.status === 400);
  check('and names the reason', noOtp.body?.error === 'checkin_code_required');

  const wrongOtp = await call(`/api/jobs/${jobId}/transition`, workerToken, { state: 'IN_PROGRESS', otp: '0000' });
  // 400, NOT 401. A 401 would make lib/api.ts sign the worker out over a
  // mistyped digit - see the note in jobHooks.ts. Pinned so it cannot drift back.
  check('a wrong code is refused as a bad field, not as a failed session', wrongOtp.status === 400);
  check('and names the code field', wrongOtp.body?.error === 'checkin_code_incorrect' && wrongOtp.body?.field === 'otp');

  const otpResponse = await call(`/api/bookings/${bookingId}/otp`, customerToken);
  check('the customer can read the arrival code', otpResponse.status === 200);
  const otp: string = otpResponse.body?.otp ?? '';
  check('the code is four digits', /^\d{4}$/.test(otp));

  const started = await call(`/api/jobs/${jobId}/transition`, workerToken, { state: 'IN_PROGRESS', otp });
  check('the correct code starts the job', started.status === 200);
  check('the job is IN_PROGRESS', started.body?.job?.status === 'IN_PROGRESS');

  const arrived = await getDb().collection('bookings').findOne({ jobId });
  check('the booking is ARRIVED', arrived?.status === 'ARRIVED');
  check('arrivedAt is recorded', arrived?.arrivedAt instanceof Date);

  const events = await getDb().collection('reliability_events').find({ bookingId }).toArray();
  check('checking in writes exactly one ON_TIME event', events.length === 1 && events[0]?.type === 'ON_TIME');

  const completed = await call(`/api/jobs/${jobId}/transition`, workerToken, { state: 'COMPLETED' });
  check('the kaarigar can complete the job', completed.status === 200);
  check('the booking is COMPLETED', (await getDb().collection('bookings').findOne({ jobId }))?.status === 'COMPLETED');

  const settled = await call(`/api/customer/jobs/${jobId}/confirm`, customerToken, {});
  check('the customer can confirm the work is done', settled.status === 200);
  check('the job is SETTLED', settled.body?.job?.status === 'SETTLED');

  // =========================================================================
  console.log('\n--- The arrival code never reaches the kaarigar ---\n');
  // =========================================================================

  const kaarigarOtpAttempt = await call(`/api/bookings/${bookingId}/otp`, workerToken);
  check('a kaarigar asking for the code is refused', kaarigarOtpAttempt.status === 403);
  check('and the refusal body contains no code', !/\b\d{4}\b/.test(JSON.stringify(kaarigarOtpAttempt.body)));

  const otpPattern = new RegExp(otp);
  const workerJobList = await call('/api/jobs', workerToken);
  check('GET /api/jobs contains no otpHash', !/otphash/i.test(workerJobList.text));
  check('GET /api/jobs contains no plain code', !otpPattern.test(workerJobList.text));

  const workerBookingList = await call('/api/bookings', workerToken);
  check('the kaarigar can list their own bookings', workerBookingList.status === 200);
  check('GET /api/bookings (kaarigar) contains no otpHash', !/otphash/i.test(workerBookingList.text));
  check('GET /api/bookings (kaarigar) contains no plain code', !otpPattern.test(workerBookingList.text));
  check('GET /api/bookings (kaarigar) mentions no otp field at all', !/"otp/i.test(workerBookingList.text));

  const workerBookingOne = await call(`/api/bookings/${bookingId}`, workerToken);
  check('the kaarigar can read the booking itself', workerBookingOne.status === 200);
  check('the single booking response carries no otp', !/otp/i.test(workerBookingOne.text));

  check('the transition response carried no otp', !/otp/i.test(scheduled.text));
  check('the transition response carried no otpHash', !/otphash/i.test(scheduled.text));

  // =========================================================================
  console.log('\n--- A legacy job: no booking, no slot, no code ---\n');
  // =========================================================================

  const own = await call('/api/jobs', workerToken, {
    id: uuidv7(),
    title: 'Own record - rewiring',
    amount: 1200,
    customerName: 'Walk-in',
    location: 'Sector 17',
  });
  check("the kaarigar can log their own job", own.status === 201);
  const ownId: string = own.body?.job?.id ?? '';
  check('the own job has no customerId', !own.body?.job?.customerId);
  check('the own job gets NO booking', (await getDb().collection('bookings').findOne({ jobId: ownId })) === null);

  const ownQuoted = await call(`/api/jobs/${ownId}/transition`, workerToken, { state: 'QUOTED' });
  check('a legacy job quotes with no price required', ownQuoted.status === 200);

  const ownAccepted = await call(`/api/jobs/${ownId}/transition`, workerToken, { state: 'ACCEPTED' });
  check('a legacy job is accepted by the worker in one tap', ownAccepted.status === 200);

  const ownScheduled = await call(`/api/jobs/${ownId}/transition`, workerToken, { state: 'SCHEDULED' });
  check('a legacy job SCHEDULES WITH NO SLOT', ownScheduled.status === 200);
  check('and is really SCHEDULED', ownScheduled.body?.job?.status === 'SCHEDULED');

  const ownStarted = await call(`/api/jobs/${ownId}/transition`, workerToken, { state: 'IN_PROGRESS' });
  check('a legacy job STARTS WITH NO ARRIVAL CODE', ownStarted.status === 200);
  check('and is really IN_PROGRESS', ownStarted.body?.job?.status === 'IN_PROGRESS');

  const ownCompleted = await call(`/api/jobs/${ownId}/transition`, workerToken, { state: 'COMPLETED' });
  check('a legacy job completes', ownCompleted.status === 200);

  const ownSettled = await call(`/api/jobs/${ownId}/transition`, workerToken, { state: 'SETTLED' });
  check('a legacy job keeps the one-tap settle', ownSettled.status === 200);
  check('the legacy walk wrote no reliability events', (await getDb().collection('reliability_events').countDocuments({})) === 1);

  // =========================================================================
  console.log('\n--- Access control on the booking routes ---\n');
  // =========================================================================

  const anon = await call(`/api/bookings/${bookingId}`);
  check('an unauthenticated booking read is refused', anon.status === 401);

  const strangerToken = signAccessToken({ uid: uuidv7(), phone: '+919999999999', roles: ['customer'] }, 3600);
  const stranger = await call(`/api/bookings/${bookingId}`, strangerToken);
  check("a stranger's booking read is 404, not 403", stranger.status === 404);

  const strangerOtp = await call(`/api/bookings/${bookingId}/otp`, strangerToken);
  check("a stranger cannot read the arrival code", strangerOtp.status === 404);
  check('and gets no code in the body', !otpPattern.test(JSON.stringify(strangerOtp.body)));

  const workerReport = await call(`/api/bookings/${bookingId}/report-no-arrival`, workerToken, {});
  check('a kaarigar cannot report themselves as missing', workerReport.status === 403);

  const customerReschedule = await call(`/api/bookings/${bookingId}/reschedule`, customerToken, futureSlot(48));
  check('a customer cannot propose a new time', customerReschedule.status === 403);

  // =========================================================================
  console.log('\n--- Public worker stats ---\n');
  // =========================================================================

  const stats = await call(`/api/workers/${handle}/stats`);
  check('worker stats are public', stats.status === 200);
  check('the on-time count is visible', stats.body?.stats?.onTime === 1);
  check('reliability is above the prior after a clean visit', stats.body?.stats?.reliability > 0.8);
  check('the deprecated trustScore is not computed', stats.body?.stats?.trustScore === 0);
  check('stats leak no phone number', !/9876543210/.test(stats.text));
  check('stats leak no earnings', !/totalEarnings/i.test(stats.text));
  check('stats carry no otp', !/otp/i.test(stats.text));

  const missing = await call('/api/workers/nobody-here/stats');
  check('an unknown handle is 404', missing.status === 404);

  // The sample sizes that let a screen avoid printing the prior as a result.
  check('stats report how many scored visits sit behind them', stats.body?.recordedEvents === 1);
  check('stats report how many requests the rate is based on', stats.body?.requestCount === 1);

  /*
    A worker with NO history. Reliability is still the 0.8 prior and the
    response rate is 1 - both deliberate - so the evidence counts must be zero
    and the public page must say "no visits yet" rather than "80%".
  */
  const freshHandle = 'fresh-kaarigar-test';
  await getDb().collection(PROFILES).insertOne({
    _id: uuidv7() as never,
    userId: uuidv7(),
    passportHandle: freshHandle,
    name: 'Fresh Worker',
    trade: 'Plumber',
    experienceYears: 1,
    location: 'Mohali',
    phone: '+919812345678',
    skills: [],
    certifications: [],
    rating: 0,
    totalJobsCount: 0,
    totalEarnings: 0,
    verifiedStatus: 'unverified',
    joinedDate: new Date().toISOString(),
  });
  const fresh = await call(`/api/workers/${freshHandle}/stats`);
  check('a new worker has stats', fresh.status === 200);
  check('a new worker has no recorded visits', fresh.body?.recordedEvents === 0);
  check('a new worker has no requests to rate', fresh.body?.requestCount === 0);
  check('a new worker sits at the 0.8 prior underneath', Math.abs((fresh.body?.stats?.reliability ?? 0) - 0.8) < 1e-9);

  const freshPage = await fetch(`${base}/p/${freshHandle}`).then((r) => r.text());
  check('the public page for a new worker shows the reliability block', freshPage.includes('id="public-reliability"'));
  check('and says there are no visits yet', freshPage.includes('No booked visits recorded yet.'));
  check('and prints no percentage for them', !freshPage.includes('On-time record'));
  check('and no response rate either', freshPage.includes('No requests yet.') && !/Replies to \d+%/.test(freshPage));

  // =========================================================================
  console.log('\n--- Reschedule and report, over HTTP ---\n');
  // =========================================================================

  const second = await call('/api/customer/jobs', customerToken, {
    kaarigarHandle: handle, title: 'Second job', amount: 300, location: 'Sector 22',
  });
  const jobB: string = second.body?.job?.id ?? '';
  await call(`/api/jobs/${jobB}/transition`, workerToken, { state: 'QUOTED', quotedPrice: 400 });
  await call(`/api/customer/jobs/${jobB}/accept`, customerToken, {});
  const slotB = futureSlot(48);
  await call(`/api/jobs/${jobB}/transition`, workerToken, { state: 'SCHEDULED', ...slotB });
  const bookingB = String((await getDb().collection('bookings').findOne({ jobId: jobB }))?._id ?? '');

  const proposed = await call(`/api/bookings/${bookingB}/reschedule`, workerToken, { ...futureSlot(72), reason: 'van broke down' });
  check('the kaarigar can propose a new time', proposed.status === 200);
  check('the proposal is pending', proposed.body?.booking?.pendingReschedule !== undefined);
  check('the original slot still stands', proposed.body?.booking?.slotStart === slotB.slotStart);

  const badApprove = await call(`/api/bookings/${bookingB}/reschedule/respond`, customerToken, {});
  check('respond requires an explicit boolean', badApprove.status === 400 && badApprove.body?.error === 'invalid_field');

  const approved = await call(`/api/bookings/${bookingB}/reschedule/respond`, customerToken, { approve: true });
  check('the customer can approve', approved.status === 200);
  check('approval moves the slot', approved.body?.booking?.slotStart !== slotB.slotStart);
  check('approval clears the proposal', approved.body?.booking?.pendingReschedule === undefined);

  const secondProposal = await call(`/api/bookings/${bookingB}/reschedule`, workerToken, futureSlot(96));
  check('a second reschedule is refused', secondProposal.status === 409);
  check('with the limit code', secondProposal.body?.error === 'reschedule_limit_reached');

  const earlyReport = await call(`/api/bookings/${bookingB}/report-no-arrival`, customerToken, {});
  check('reporting before arriveBy is refused', earlyReport.status === 400);
  check('with the too_early code', earlyReport.body?.error === 'too_early');

  // =========================================================================
  console.log('\n--- Phase 5: the customer side of a booking ---\n');
  // =========================================================================

  /** A customer request walked to SCHEDULED, with its booking COMMITTED. */
  const scheduledJob = async (title: string) => {
    const made = await call('/api/customer/jobs', customerToken, { kaarigarHandle: handle, title, amount: 300, location: 'Sector 22' });
    const id: string = made.body?.job?.id ?? '';
    await call(`/api/jobs/${id}/transition`, workerToken, { state: 'QUOTED', quotedPrice: 350 });
    await call(`/api/customer/jobs/${id}/accept`, customerToken, {});
    await call(`/api/jobs/${id}/transition`, workerToken, { state: 'SCHEDULED', ...futureSlot(30) });
    const row = await getDb().collection('bookings').findOne({ jobId: id });
    return { jobId: id, bookingId: String(row?._id ?? '') };
  };
  /** Move a committed booking's arrival deadline into the past, without reading it. */
  const makeOverdue = async (bookingId: string) => {
    await getDb().collection('bookings').updateOne(
      { _id: bookingId as never },
      { $set: { slotStart: new Date(Date.now() - 4 * HOUR), slotEnd: new Date(Date.now() - 3 * HOUR), arriveBy: new Date(Date.now() - 2 * HOUR) } }
    );
  };
  const bookingStatusOf = async (bookingId: string) => (await getDb().collection('bookings').findOne({ _id: bookingId as never }))?.status;
  const eventsFor = async (bookingId: string, type: string) =>
    getDb().collection('reliability_events').countDocuments({ bookingId, type });

  // --- Urgent requests get the short reply window ---
  const urgentMade = await call('/api/customer/jobs', customerToken, { kaarigarHandle: handle, title: 'Urgent leak', amount: 200, location: 'Sector 22', urgent: true });
  const urgentRow = await getDb().collection('bookings').findOne({ jobId: urgentMade.body?.job?.id });
  const urgentWindowMin = urgentRow ? (urgentRow.acceptBy.getTime() - urgentRow.createdAt.getTime()) / 60_000 : -1;
  check('an urgent request is marked urgent', urgentRow?.urgent === true);
  check('an urgent request gets the 30-minute reply window', Math.round(urgentWindowMin) === 30);
  const normalRow = await getDb().collection('bookings').findOne({ jobId: jobB });
  check('a normal request gets the 4-hour reply window',
    normalRow ? Math.round((normalRow.acceptBy.getTime() - normalRow.createdAt.getTime()) / 60_000) === 240 : false);

  // --- "The kaarigar did not arrive", over real HTTP ---
  /*
    The route applies overdue rules before handling the report, so by the time
    arriveBy has passed the booking is already LATE when the report arrives. The
    first version refused that as wrong_state and could never succeed over HTTP.
  */
  const reported = await scheduledJob('Report no-arrival');
  await makeOverdue(reported.bookingId);
  const report = await call(`/api/bookings/${reported.bookingId}/report-no-arrival`, customerToken, {});
  check('report-no-arrival after arriveBy succeeds over HTTP', report.status === 200);
  check('and the booking is LATE', report.body?.booking?.status === 'LATE');
  check('with exactly one LATE event', (await eventsFor(reported.bookingId, 'LATE')) === 1);
  const reportAgain = await call(`/api/bookings/${reported.bookingId}/report-no-arrival`, customerToken, {});
  check('reporting again is still success', reportAgain.status === 200);
  check('and writes no second LATE event', (await eventsFor(reported.bookingId, 'LATE')) === 1);

  // --- The late-cancel exception ---
  const onTime = await scheduledJob('Cancel while on time');
  const refusedCancel = await call(`/api/customer/jobs/${onTime.jobId}/cancel`, customerToken, {});
  check('a customer still cannot cancel a SCHEDULED job whose kaarigar is not late', refusedCancel.status === 409);
  check('with the not_cancellable code', refusedCancel.body?.error === 'not_cancellable');
  check('and the booking is untouched', (await bookingStatusOf(onTime.bookingId)) === 'COMMITTED');

  const late = await scheduledJob('Cancel while late');
  await makeOverdue(late.bookingId);
  const lateCancel = await call(`/api/customer/jobs/${late.jobId}/cancel`, customerToken, {});
  check('a customer CAN cancel a SCHEDULED job once the kaarigar is late', lateCancel.status === 200);
  check('the job is CANCELLED', lateCancel.body?.job?.status === 'CANCELLED');
  check('the booking is NO_SHOW', (await bookingStatusOf(late.bookingId)) === 'NO_SHOW');
  check('the kaarigar gets exactly one LATE and one NO_SHOW',
    (await eventsFor(late.bookingId, 'LATE')) === 1 && (await eventsFor(late.bookingId, 'NO_SHOW')) === 1);
  check('and no LATE_CANCEL', (await eventsFor(late.bookingId, 'LATE_CANCEL')) === 0);
  const lateCancelHistory = (await getDb().collection('bookings').findOne({ _id: late.bookingId as never }))?.history ?? [];
  check('the NO_SHOW is attributed to the customer who gave up', lateCancelHistory.some((h: any) => h.to === 'NO_SHOW' && h.by === 'customer'));

  // A customer job with NO booking: the exception needs a booking to prove lateness.
  process.env.BOOKINGS_ENABLED = 'false';
  const legacyMade = await call('/api/customer/jobs', customerToken, { kaarigarHandle: handle, title: 'Legacy customer job', amount: 300, location: 'Sector 22' });
  const legacyCustomerJob: string = legacyMade.body?.job?.id ?? '';
  process.env.BOOKINGS_ENABLED = 'true';
  check('a customer job made with the flag off has no booking', (await getDb().collection('bookings').findOne({ jobId: legacyCustomerJob })) === null);
  await call(`/api/jobs/${legacyCustomerJob}/transition`, workerToken, { state: 'QUOTED', quotedPrice: 350 });
  await call(`/api/customer/jobs/${legacyCustomerJob}/accept`, customerToken, {});
  const legacyScheduled = await call(`/api/jobs/${legacyCustomerJob}/transition`, workerToken, { state: 'SCHEDULED' });
  check('that legacy customer job still schedules with no slot', legacyScheduled.status === 200);
  const legacyCancel = await call(`/api/customer/jobs/${legacyCustomerJob}/cancel`, customerToken, {});
  check('and the customer still cannot cancel it once SCHEDULED', legacyCancel.status === 409);

  // The kaarigar cannot use the customer's late-cancel route.
  const workerTries = await call(`/api/customer/jobs/${onTime.jobId}/cancel`, workerToken, {});
  check("a kaarigar cannot call the customer's cancel route", workerTries.status === 403);

  // --- Health flags the screens read ---
  const healthOn = await call('/api/health');
  check('health reports bookings enabled', healthOn.body?.bookingsEnabled === true);
  check('health reports demo slots off by default', healthOn.body?.bookingDemoSlots === false);
  process.env.BOOKING_DEMO_SLOTS = 'true';
  check('demo slots on when both flags are on', (await call('/api/health')).body?.bookingDemoSlots === true);
  process.env.BOOKINGS_ENABLED = 'false';
  const healthOff = await call('/api/health');
  check('demo slots are off whenever bookings are off', healthOff.body?.bookingDemoSlots === false);
  check('and health reports bookings disabled', healthOff.body?.bookingsEnabled === false);
  process.env.BOOKINGS_ENABLED = 'true';
  delete process.env.BOOKING_DEMO_SLOTS;

  // =========================================================================
  console.log('\n--- The flag turns the surface off ---\n');
  // =========================================================================

  process.env.BOOKINGS_ENABLED = 'false';
  const offList = await call('/api/bookings', customerToken);
  check('GET /api/bookings is 404 with the flag off', offList.status === 404);
  const offOtp = await call(`/api/bookings/${bookingId}/otp`, customerToken);
  check('the arrival code endpoint is 404 with the flag off', offOtp.status === 404);
  const offStats = await call(`/api/workers/${handle}/stats`);
  check('public stats are 404 with the flag off', offStats.status === 404);
  process.env.BOOKINGS_ENABLED = 'true';
} finally {
  console.log('\n--- Cleanup ---\n');
  try {
    await getDb().dropDatabase();
    console.log(`[test] dropped ${databaseName}`);
  } catch (err) {
    console.error('[test] could not drop the test database:', err);
  }
  server.close();
  await closeDb();
}

console.log(`\n${'='.repeat(52)}`);
console.log(`  passed: ${passed}    failed: ${failed}    total: ${passed + failed}`);
console.log(`${'='.repeat(52)}\n`);
if (failed > 0) {
  for (const label of failures) console.error(`  FAILED: ${label}`);
  process.exit(1);
}
