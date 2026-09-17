/**
 * POST /api/internal/sweep, over real HTTP.
 *
 * The Phase 3 checkpoint, as a script: seed bookings that are already past
 * their deadlines, call the sweep twice in a row, and require that the first
 * call moves them and the second moves nothing. Plus every way the secret can
 * be wrong, the flag being off, and the database not being ready.
 *
 * The transition rules themselves are proved in scripts/test-bookings.ts with
 * an injected clock. This suite is about the ENDPOINT: the gate, the
 * fall-through to the ordinary 404, the response shape and idempotency across
 * two separate HTTP requests.
 *
 * Seeding uses the transition functions with a `now` in the past, so each
 * booking is created legitimately and then simply left alone until its
 * deadline has gone by. The sweep itself runs on the server's real clock,
 * exactly as it will when cron-job.org calls it.
 *
 * Throwaway database, dropped on exit.
 *
 *   npx tsx scripts/test-sweeper.ts
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express from 'express';

const databaseName = `kg_sweep_test_${Date.now()}_${randomBytes(3).toString('hex')}`;
const SECRET = randomBytes(32).toString('hex'); // 64 characters
process.env.MONGODB_DB_NAME = databaseName;
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.CHECKIN_OTP_SECRET = randomBytes(48).toString('hex');
process.env.NODE_ENV = 'development';
process.env.BOOKINGS_ENABLED = 'true';
process.env.SWEEP_SECRET = SECRET;
// Pin every window so a stray .env cannot change what the counts mean.
process.env.ACCEPT_WINDOW_URGENT_MIN = '30';
process.env.ACCEPT_WINDOW_NORMAL_MIN = '240';
process.env.SCHEDULE_WINDOW_MIN = '1440';
process.env.ARRIVAL_GRACE_MIN = '60';
process.env.NO_SHOW_AFTER_MIN = '1440';
process.env.RESCHEDULE_MIN_NOTICE_H = '12';
process.env.MAX_RESCHEDULES = '1';

import { connectDb, closeDb, getDb } from '../src/server/db';
import { registerRoutes } from '../src/server/routes';
import { createJob, JOBS } from '../src/server/data/jobs';
import { createBooking, findBookingDoc } from '../src/server/data/bookings';
import { RELIABILITY_EVENTS } from '../src/server/data/reliability';
import {
  armScheduleDeadline,
  commitSlot,
  markResponded,
  requestReschedule,
} from '../src/server/bookings/transitions';

const MIN = 60_000;
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

async function sweep(headers: Record<string, string> = { 'x-sweep-secret': SECRET }, method = 'POST', path = '/api/internal/sweep') {
  const response = await fetch(base + path, { method, headers });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { status: response.status, body, text, cacheControl: response.headers.get('cache-control') };
}

const T = Date.now();
let seq = 0;

async function seedBooking(createdAt: number) {
  seq += 1;
  const customerId = `sweep-cust-${seq}`;
  const kaarigarId = `sweep-kaar-${seq}`;
  const outcome = await createJob(kaarigarId, { title: `Sweep job ${seq}`, amount: 400 }, { actorId: customerId, customerId });
  assert.equal(outcome.status, 'created');
  const jobId = outcome.status === 'created' ? outcome.job.id : '';
  const booking = await createBooking({ jobId, customerId, kaarigarId, jobTitle: `Sweep job ${seq}`, urgent: false }, createdAt);
  return { bookingId: String(booking._id), jobId };
}

const status = async (bookingId: string) => (await findBookingDoc(bookingId))?.status;
const eventCount = async (type: string) => getDb().collection(RELIABILITY_EVENTS).countDocuments({ type });

try {
  // =========================================================================
  console.log('\n--- Seeding bookings that are already overdue ---\n');
  // =========================================================================

  // 1. Never answered: created 10h ago, 4h window -> past acceptBy.
  const unanswered = await seedBooking(T - 10 * HOUR);

  // 2. Quoted, price agreed, no slot ever named: scheduleBy was 24h after 30h ago.
  const unscheduled = await seedBooking(T - 30 * HOUR);
  assert.ok((await markResponded(unscheduled.bookingId, T - 30 * HOUR + MIN)).ok);
  assert.ok((await armScheduleDeadline(unscheduled.bookingId, T - 30 * HOUR + 2 * MIN)).ok);

  // 3. Committed, arriveBy passed 4h ago - late, not yet a no-show.
  const late = await seedBooking(T - 10 * HOUR);
  assert.ok((await markResponded(late.bookingId, T - 10 * HOUR + MIN)).ok);
  assert.ok((await commitSlot(late.bookingId, T - 6 * HOUR, T - 5 * HOUR, T - 10 * HOUR + 2 * MIN)).ok);

  // 4. Committed, arriveBy passed 34h ago - one sweep must take it LATE then NO_SHOW.
  const abandoned = await seedBooking(T - 40 * HOUR);
  assert.ok((await markResponded(abandoned.bookingId, T - 40 * HOUR + MIN)).ok);
  assert.ok((await commitSlot(abandoned.bookingId, T - 36 * HOUR, T - 35 * HOUR, T - 40 * HOUR + 2 * MIN)).ok);

  // 5. Committed with a new time proposed and never answered; the original slot has passed.
  const proposal = await seedBooking(T - 40 * HOUR);
  assert.ok((await markResponded(proposal.bookingId, T - 40 * HOUR + MIN)).ok);
  assert.ok((await commitSlot(proposal.bookingId, T - 20 * HOUR, T - 19 * HOUR, T - 40 * HOUR + 2 * MIN)).ok);
  assert.ok((await requestReschedule(proposal.bookingId, T + 48 * HOUR, T + 49 * HOUR, 'van broke down', T - 39 * HOUR)).ok);

  // 6. A booking in good standing that no rule may touch.
  const healthy = await seedBooking(T - 10 * MIN);

  check('seeded: the unanswered request is still REQUESTED', (await status(unanswered.bookingId)) === 'REQUESTED');
  check('seeded: the unscheduled job is still RESPONDED', (await status(unscheduled.bookingId)) === 'RESPONDED');
  check('seeded: the late booking is still COMMITTED', (await status(late.bookingId)) === 'COMMITTED');
  check('seeded: the abandoned booking is still COMMITTED', (await status(abandoned.bookingId)) === 'COMMITTED');
  check('seeded: the unanswered proposal is still pending', Boolean((await findBookingDoc(proposal.bookingId))?.pendingReschedule));

  // =========================================================================
  console.log('\n--- The secret ---\n');
  // =========================================================================

  // What a path that was never built answers. Every refusal must match it.
  const neverBuilt = await sweep({}, 'POST', '/api/internal/sweep-that-does-not-exist');
  check('control: an unbuilt /api path is a JSON 404', neverBuilt.status === 404 && neverBuilt.body?.error === 'not_found');

  const noHeader = await sweep({});
  check('no header: 404', noHeader.status === 404);
  check('no header: the ordinary not_found body', noHeader.body?.error === 'not_found');
  check('no header: the message names only the path, like any unbuilt route',
    noHeader.body?.message === 'No handler for POST /api/internal/sweep');
  check('no header: nothing in the body hints at a secret', !/secret|sweep_|unauthori|forbidden/i.test(noHeader.text.replace('/api/internal/sweep', '')));

  const wrongSameLength = await sweep({ 'x-sweep-secret': randomBytes(32).toString('hex') });
  check('wrong secret (same length): 404', wrongSameLength.status === 404);
  check('wrong secret (same length): byte-identical to no header', wrongSameLength.text === noHeader.text);

  const wrongShort = await sweep({ 'x-sweep-secret': 'letmein' });
  check('wrong secret (different length): 404, identical body', wrongShort.status === 404 && wrongShort.text === noHeader.text);

  const inQuery = await sweep({}, 'POST', `/api/internal/sweep?secret=${SECRET}`);
  check('secret in the query string instead of the header: 404', inQuery.status === 404);

  const wrongHeaderName = await sweep({ authorization: `Bearer ${SECRET}` });
  check('secret sent as a Bearer token instead of x-sweep-secret: 404', wrongHeaderName.status === 404);

  const getWithSecret = await sweep({ 'x-sweep-secret': SECRET }, 'GET');
  check('GET with the right secret: 404 (POST only)', getWithSecret.status === 404);

  process.env.SWEEP_SECRET = 'too-short';
  const weak = await sweep({ 'x-sweep-secret': 'too-short' });
  check('a configured secret under 32 characters never works, even when matched', weak.status === 404);
  delete process.env.SWEEP_SECRET;
  const unset = await sweep({ 'x-sweep-secret': '' });
  check('SWEEP_SECRET unset: an empty header does not match', unset.status === 404);
  process.env.SWEEP_SECRET = SECRET;

  check('no refusal moved anything', (await status(unanswered.bookingId)) === 'REQUESTED' && (await status(late.bookingId)) === 'COMMITTED');

  // =========================================================================
  console.log('\n--- The flag ---\n');
  // =========================================================================

  process.env.BOOKINGS_ENABLED = 'false';
  const disabled = await sweep();
  check('flag off, right secret: 200', disabled.status === 200);
  check('flag off: says so, rather than looking misconfigured', disabled.body?.enabled === false);
  check('flag off: sweeps nothing', (await status(unanswered.bookingId)) === 'REQUESTED' && (await status(abandoned.bookingId)) === 'COMMITTED');
  process.env.BOOKINGS_ENABLED = 'true';

  // =========================================================================
  console.log('\n--- Two sweeps in a row (the checkpoint) ---\n');
  // =========================================================================

  const first = await sweep();
  console.log(`  first sweep:  ${JSON.stringify(first.body)}`);
  check('first sweep: 200', first.status === 200);
  check('first sweep: enabled', first.body?.enabled === true);
  check('first sweep: not cacheable', (first.cacheControl ?? '').includes('no-store'));
  check('first sweep: one unanswered request expired', first.body?.expired === 1);
  check('first sweep: one unscheduled job expired', first.body?.scheduleExpired === 1);
  check('first sweep: three bookings went late', first.body?.late === 3);
  check('first sweep: one of them also became a no-show', first.body?.noShow === 1);
  check('first sweep: one unanswered proposal was closed', first.body?.rescheduleAutoRejected === 1);
  check('first sweep: reports when it ran', typeof first.body?.ranAt === 'string' && typeof first.body?.durationMs === 'number');

  check('after: the unanswered request is EXPIRED', (await status(unanswered.bookingId)) === 'EXPIRED');
  check('after: its job was cancelled', (await getDb().collection(JOBS).findOne({ _id: unanswered.jobId as never }))?.status === 'CANCELLED');
  check('after: the unscheduled job is EXPIRED', (await status(unscheduled.bookingId)) === 'EXPIRED');
  check('after: the late booking is LATE', (await status(late.bookingId)) === 'LATE');
  check('after: the abandoned booking is NO_SHOW', (await status(abandoned.bookingId)) === 'NO_SHOW');
  const proposalDoc = await findBookingDoc(proposal.bookingId);
  check('after: the stale proposal is gone and the original slot stands',
    proposalDoc !== null && !('pendingReschedule' in proposalDoc) && proposalDoc.slotStart?.getTime() === T - 20 * HOUR);
  check('after: the booking in good standing was not touched', (await status(healthy.bookingId)) === 'REQUESTED');

  const eventsAfterFirst = {
    EXPIRED: await eventCount('EXPIRED'),
    LATE_CANCEL: await eventCount('LATE_CANCEL'),
    LATE: await eventCount('LATE'),
    NO_SHOW: await eventCount('NO_SHOW'),
  };
  check('ledger: one EXPIRED, one LATE_CANCEL, three LATE, one NO_SHOW',
    eventsAfterFirst.EXPIRED === 1 && eventsAfterFirst.LATE_CANCEL === 1 && eventsAfterFirst.LATE === 3 && eventsAfterFirst.NO_SHOW === 1);

  const second = await sweep();
  console.log(`  second sweep: ${JSON.stringify(second.body)}`);
  check('second sweep: 200', second.status === 200);
  check('second sweep: every count is zero',
    second.body?.expired === 0 && second.body?.scheduleExpired === 0 && second.body?.late === 0 &&
    second.body?.noShow === 0 && second.body?.rescheduleAutoRejected === 0);
  check('second sweep: the ledger did not grow',
    (await eventCount('EXPIRED')) === eventsAfterFirst.EXPIRED &&
    (await eventCount('LATE_CANCEL')) === eventsAfterFirst.LATE_CANCEL &&
    (await eventCount('LATE')) === eventsAfterFirst.LATE &&
    (await eventCount('NO_SHOW')) === eventsAfterFirst.NO_SHOW);

  // =========================================================================
  console.log('\n--- Overlapping sweeps ---\n');
  // =========================================================================

  // A slow sweep still running when the next cron tick arrives.
  const racer = await seedBooking(T - 10 * HOUR);
  const [a, b] = await Promise.all([sweep(), sweep()]);
  check('overlapping sweeps: both succeed', a.status === 200 && b.status === 200);
  check('overlapping sweeps: the booking is expired exactly once between them', (a.body?.expired ?? 0) + (b.body?.expired ?? 0) === 1);
  check('overlapping sweeps: exactly one EXPIRED event for it',
    (await getDb().collection(RELIABILITY_EVENTS).countDocuments({ bookingId: racer.bookingId, type: 'EXPIRED' })) === 1);

  // =========================================================================
  console.log('\n--- The database not ready (a cold start) ---\n');
  // =========================================================================

  await closeDb();
  const coldRight = await sweep();
  check('database down, right secret: 503', coldRight.status === 503);
  check('database down: the standard database_unavailable body', coldRight.body?.error === 'database_unavailable');
  const coldWrong = await sweep({ 'x-sweep-secret': 'nope' });
  check('database down, wrong secret: still 404 - the 503 is never shown to a stranger', coldWrong.status === 404);
  const reconnected = await connectDb();
  assert.ok(reconnected, 'reconnect for cleanup');
  check('after reconnecting, sweeping works again', (await sweep()).status === 200);
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
process.exit(0);
