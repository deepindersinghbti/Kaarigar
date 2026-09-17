/**
 * The customer's booking screens, driven in a real browser, with the flag ON.
 *
 * Phase 5. The worker's side is scripts/test-booking-ui.ts; this is the other
 * half of the same appointments: the urgent toggle on the request form, the
 * arrival code, answering a proposed new time, reporting a kaarigar who did not
 * come, giving up on a late one, and what an expired request offers next.
 *
 * Same three rules as every browser suite here:
 *   - scope assertions to one request (#job-<id>), never the whole page;
 *   - assert absence as well as presence;
 *   - wait for async outcomes, never assert them instantly.
 *
 * `window.confirm` is accepted automatically: every destructive customer action
 * asks first, and the dialog itself is not what is under test.
 *
 * Throwaway database, dropped on exit.
 *
 *   npx tsx scripts/test-customer-booking-ui.ts
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createServer } from 'vite';

const databaseName = `kg_cbui_test_${Date.now()}_${randomBytes(3).toString('hex')}`;
process.env.MONGODB_DB_NAME = databaseName;
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.CHECKIN_OTP_SECRET = randomBytes(48).toString('hex');
process.env.NODE_ENV = 'development';
process.env.VITE_USE_API = 'all';
process.env.BOOKINGS_ENABLED = 'true';
process.env.DEMO_OTP_ENABLED = 'true';
process.env.DEMO_OTP_CODE = '111111';
const customerCode = String(randomInt(200000, 999999));
process.env.DEMO_CUSTOMER_OTP_CODE = customerCode;
delete process.env.BOOKING_DEMO_SLOTS;

import { connectDb, closeDb, getDb } from '../src/server/db';
import { registerRoutes } from '../src/server/routes';
import { PROFILES } from '../src/server/data/profiles';
import { uuidv7 } from '../src/lib/ids';

const MIN = 60_000;
const HOUR = 3_600_000;
const workerPhone = '+919876543210';
const customerPhone = '+910123456789';

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
const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
app.use(vite.middlewares);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
process.env.PUBLIC_ORIGIN = base;
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

async function login(phone: string, code?: string) {
  const challenge = await call('/api/auth/otp/request', '', { phone });
  assert.equal(challenge.status, 201, `otp/request for ${phone}`);
  const verified = await call('/api/auth/otp/verify', '', {
    challengeId: challenge.body.challengeId,
    code: code ?? challenge.body.devCode,
  });
  assert.equal(verified.status, 200, `otp/verify for ${phone}`);
  return verified.body;
}

let browser: any = null;

try {
  const worker = await login(workerPhone);
  const customer = await login(customerPhone, customerCode);
  const wt: string = worker.accessToken;
  const ct: string = customer.accessToken;

  await call('/api/passport/me', wt);
  const handle = String((await getDb().collection(PROFILES).findOne({ userId: worker.user.uid }))?.passportHandle ?? '');
  assert.ok(handle, 'the worker should have a passport handle');

  const futureSlot = (hoursAhead: number) => {
    const start = Date.now() + hoursAhead * HOUR;
    return { slotStart: new Date(start).toISOString(), slotEnd: new Date(start + 2 * HOUR).toISOString() };
  };
  const bookingRow = (jobId: string) => getDb().collection('bookings').findOne({ jobId });
  const jobRow = (jobId: string) => getDb().collection('jobs').findOne({ _id: jobId as never });

  /** A customer request walked to a named stage through the real routes. */
  const seed = async (title: string, stage: 'requested' | 'accepted' | 'committed') => {
    const made = await call('/api/customer/jobs', ct, { kaarigarHandle: handle, title, amount: 500, location: 'Sector 22, Chandigarh' });
    assert.equal(made.status, 201, `create ${title}`);
    const id: string = made.body.job.id;
    if (stage !== 'requested') {
      assert.equal((await call(`/api/jobs/${id}/transition`, wt, { state: 'QUOTED', quotedPrice: 700 })).status, 200);
      assert.equal((await call(`/api/customer/jobs/${id}/accept`, ct, {})).status, 200);
    }
    if (stage === 'committed') {
      assert.equal((await call(`/api/jobs/${id}/transition`, wt, { state: 'SCHEDULED', ...futureSlot(26) })).status, 200);
    }
    return id;
  };

  // Seeded through the API before the browser opens, one per stage under test.
  const jobReply = await seed('Customer UI - awaiting reply', 'requested');
  const jobSchedule = await seed('Customer UI - awaiting a time', 'accepted');
  const jobCode = await seed('Customer UI - arrival code', 'committed');
  const jobMove = await seed('Customer UI - new time proposed', 'committed');
  const jobLate = await seed('Customer UI - kaarigar late', 'committed');
  const jobExpired = await seed('Customer UI - never answered', 'requested');
  const jobNoShowReport = await seed('Customer UI - report no-arrival', 'committed');

  // The kaarigar proposes a new time on one of them.
  const moveBooking = String((await bookingRow(jobMove))?._id);
  const proposedSlot = futureSlot(72);
  assert.equal((await call(`/api/bookings/${moveBooking}/reschedule`, wt, { ...proposedSlot, reason: 'van broke down' })).status, 200);

  // One kaarigar is already late; one request was never answered.
  await getDb().collection('bookings').updateOne({ jobId: jobLate }, {
    $set: { slotStart: new Date(Date.now() - 4 * HOUR), slotEnd: new Date(Date.now() - 3 * HOUR), arriveBy: new Date(Date.now() - 2 * HOUR) },
  });
  await getDb().collection('bookings').updateOne({ jobId: jobExpired }, { $set: { acceptBy: new Date(Date.now() - MIN) } });

  // The arrival code the server holds for jobCode, fetched the way the screen will.
  const codeBooking = String((await bookingRow(jobCode))?._id);
  const realCode = (await call(`/api/bookings/${codeBooking}/otp`, ct)).body.otp as string;
  assert.ok(/^\d{4}$/.test(realCode), 'the customer can fetch the code over the API');

  // -------------------------------------------------------------------------
  const browserChecksWanted = process.env.SKIP_BROWSER_CHECKS !== 'true';
  let chromium: any = null;
  if (browserChecksWanted) {
    try {
      chromium = process.env.PLAYWRIGHT_MODULE
        ? (await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)).chromium
        : (await import('playwright-core')).chromium;
    } catch {
      console.log('SKIP browser checks: playwright-core is not installed.');
    }
  } else {
    console.log('SKIP browser checks: SKIP_BROWSER_CHECKS=true.');
  }
  if (chromium) {
    try {
      browser = await chromium.launch({ channel: 'msedge', headless: true });
    } catch (err) {
      console.log(`SKIP browser checks: could not launch system Edge (${(err as Error).message.split('\n')[0]}).`);
    }
  }

  if (browser) {
    const session = (who: any) => JSON.stringify({
      accessToken: who.accessToken,
      refreshToken: who.refreshToken,
      expiresAt: Date.now() + 15 * 60 * 1000,
      user: who.user,
    });
    const newCustomerPage = async () => {
      const context = await browser.newContext({ viewport: { width: 480, height: 1000 } });
      await context.addInitScript(([s, lang]: [string, string]) => {
        localStorage.setItem('kaarigar_lang', lang);
        localStorage.setItem('kaarigar_auth_v1', s);
      }, [session(customer), 'en']);
      const page = await context.newPage();
      page.on('dialog', (d: any) => void d.accept());
      return { context, page };
    };

    const { page: c } = await newCustomerPage();
    const pageErrors: string[] = [];
    c.on('pageerror', (e: Error) => pageErrors.push(e.message));

    // ---- The request form ----
    console.log('\n--- Requesting, with the urgent toggle ---\n');
    await c.goto(`${base}/customer/request/${handle}`, { waitUntil: 'networkidle' });
    await c.bringToFront();
    await c.waitForSelector('#req-urgent', { timeout: 20_000 });
    check('the request form offers "urgent" when bookings are on', await c.locator('#req-urgent').isVisible());
    check('and explains what it changes', (await c.locator('label[for="req-urgent"]').innerText()).includes('30 minutes'));
    await c.locator('#req-title').fill('Customer UI - urgent from the form');
    await c.locator('#req-location').fill('Sector 22, Chandigarh');
    await c.locator('#req-urgent').check();
    await c.locator('button[type="submit"]').click();
    await c.waitForURL(/\/customer\/requests/, { timeout: 20_000 });
    const urgentJob = await getDb().collection('jobs').findOne({ title: 'Customer UI - urgent from the form' });
    const urgentBooking = urgentJob ? await bookingRow(String(urgentJob._id)) : null;
    check('the form sent the request as urgent', urgentBooking?.urgent === true);
    check('so it got the 30-minute reply window',
      urgentBooking ? Math.round((urgentBooking.acceptBy.getTime() - urgentBooking.createdAt.getTime()) / MIN) === 30 : false);

    // ---- The list ----
    await c.waitForSelector(`#job-${jobReply}`, { timeout: 20_000 });
    const req = (id: string) => c.locator(`#job-${id}`);

    console.log('\n--- Waiting on the kaarigar ---\n');
    check('a new request says when the kaarigar must reply by', (await req(jobReply).innerText()).includes('has until'));
    check('an agreed price says it is waiting for a time', (await req(jobSchedule).innerText()).includes('pick a time'));
    check('neither shows an arrival code yet',
      (await req(jobReply).locator(`#arrival-code-${jobReply}`).count()) === 0 &&
      (await req(jobSchedule).locator(`#arrival-code-${jobSchedule}`).count()) === 0);

    console.log('\n--- The arrival code ---\n');
    check('a committed booking shows the agreed visit time', (await req(jobCode).locator(`#booking-slot-${jobCode}`).innerText()).includes('Visit:'));
    // Waited for: the code arrives with its request, but after the page's first paint.
    await c.waitForSelector(`#arrival-code-${jobCode}`, { timeout: 20_000 });
    check('and shows the arrival code', await req(jobCode).locator(`#arrival-code-${jobCode}`).isVisible());
    check('the code on screen is the code the server holds', (await req(jobCode).locator(`#arrival-code-digits-${jobCode}`).innerText()).trim() === realCode);
    check('with a warning to hand it over only at the door', (await req(jobCode).locator(`#arrival-code-${jobCode}`).innerText()).includes('at your door'));
    check('"did not arrive" is NOT offered before the deadline', (await req(jobCode).locator(`#didnt-arrive-${jobCode}`).count()) === 0);

    console.log('\n--- A proposed new time ---\n');
    check('the proposal is shown with its reason', (await req(jobMove).locator(`#reschedule-${jobMove}`).innerText()).includes('van broke down'));
    if (process.env.SCREENSHOT_DIR) await req(jobMove).screenshot({ path: `${process.env.SCREENSHOT_DIR}/customer-reschedule.png` });
    await req(jobMove).locator(`#reschedule-approve-${jobMove}`).click();
    await c.waitForSelector(`#reschedule-${jobMove}`, { state: 'detached', timeout: 20_000 });
    const moved = await bookingRow(jobMove);
    check('accepting moves the visit to the proposed time', moved?.slotStart?.toISOString() === proposedSlot.slotStart);
    check('and clears the proposal', moved !== null && !('pendingReschedule' in moved));

    console.log('\n--- A late kaarigar ---\n');
    check('the list read marked the overdue booking LATE', (await bookingRow(jobLate))?.status === 'LATE');
    check('a late kaarigar shows the late banner', await req(jobLate).locator(`#booking-late-${jobLate}`).isVisible());
    check('the code is still shown - a late kaarigar can still arrive', await req(jobLate).locator(`#arrival-code-${jobLate}`).isVisible());
    check('the customer can give up on a late kaarigar', await req(jobLate).locator(`#cancel-late-${jobLate}`).isVisible());

    // OPT-IN SCREENSHOTS for reviewing the look; unset, this does nothing.
    const shots = process.env.SCREENSHOT_DIR;
    if (shots) {
      await req(jobCode).screenshot({ path: `${shots}/customer-code.png` });
      await req(jobLate).screenshot({ path: `${shots}/customer-late.png` });
      await req(jobExpired).screenshot({ path: `${shots}/customer-expired.png` });
    }
    check('the ordinary cancel button is still absent on a scheduled job',
      (await req(jobLate).getByRole('button', { name: 'Cancel request' }).count()) === 0);
    await req(jobLate).locator(`#cancel-late-${jobLate}`).click();
    await c.waitForSelector(`#booking-ended-${jobLate}`, { timeout: 20_000 });
    check('giving up cancels the job', (await jobRow(jobLate))?.status === 'CANCELLED');
    check('and marks the kaarigar as not arriving', (await bookingRow(jobLate))?.status === 'NO_SHOW');
    check('the request says the kaarigar did not arrive', (await req(jobLate).locator(`#booking-ended-${jobLate}`).innerText()).includes('did not arrive'));
    check('and offers to request another kaarigar', await req(jobLate).locator(`#request-another-${jobLate}`).isVisible());
    check('the code is gone once it is over', (await req(jobLate).locator(`#arrival-code-${jobLate}`).count()) === 0);

    console.log('\n--- A request nobody answered ---\n');
    check('the unanswered request expired on the list read', (await bookingRow(jobExpired))?.status === 'EXPIRED');
    check('it says the kaarigar did not reply in time', (await req(jobExpired).locator(`#booking-ended-${jobExpired}`).innerText()).includes('did not reply'));
    check('and offers to request another kaarigar', await req(jobExpired).locator(`#request-another-${jobExpired}`).isVisible());
    await req(jobExpired).locator(`#request-another-${jobExpired}`).click();
    await c.waitForURL(/\/customer\/?$/, { timeout: 20_000 });
    check('"request another kaarigar" opens the directory', /\/customer\/?$/.test(c.url()));

    // ---- "The kaarigar did not arrive": the button appears on the clock ----
    console.log('\n--- Reporting a kaarigar who did not come ---\n');
    /*
      The button depends on the time, and a list read would itself mark an
      overdue booking LATE - so the page is loaded while the deadline is still
      in the future, and the BROWSER clock is moved past it. The server's clock
      is not, so the first tap is refused as too_early: the refusal branch.
      Then the deadline really is moved into the past, and the second tap wins.
    */
    const { page: r } = await newCustomerPage();
    await r.clock.install({ time: new Date() });
    await r.goto(`${base}/customer/requests`, { waitUntil: 'networkidle' });
    await r.bringToFront();
    await r.waitForSelector(`#job-${jobNoShowReport}`, { timeout: 20_000 });
    const rep = r.locator(`#job-${jobNoShowReport}`);
    check('before the deadline there is no "did not arrive" button', (await rep.locator(`#didnt-arrive-${jobNoShowReport}`).count()) === 0);

    await r.clock.fastForward('30:00:00');
    await r.waitForSelector(`#didnt-arrive-${jobNoShowReport}`, { timeout: 20_000 });
    check('once the deadline passes on screen, the button appears', await rep.locator(`#didnt-arrive-${jobNoShowReport}`).isVisible());

    await rep.locator(`#didnt-arrive-${jobNoShowReport}`).click();
    await r.waitForFunction(() => document.body.innerText.includes('still has time'), undefined, { timeout: 20_000 });
    check('reporting before the SERVER deadline is refused in the customer\'s words', (await r.locator('body').innerText()).includes('still has time to arrive'));
    check('and nothing was recorded', (await bookingRow(jobNoShowReport))?.status === 'COMMITTED');

    await getDb().collection('bookings').updateOne({ jobId: jobNoShowReport }, {
      $set: { slotStart: new Date(Date.now() - 4 * HOUR), slotEnd: new Date(Date.now() - 3 * HOUR), arriveBy: new Date(Date.now() - 2 * HOUR) },
    });
    await rep.locator(`#didnt-arrive-${jobNoShowReport}`).click();
    await r.waitForSelector(`#booking-late-${jobNoShowReport}`, { timeout: 20_000 });
    check('after the real deadline, the report succeeds and the kaarigar shows as late', await rep.locator(`#booking-late-${jobNoShowReport}`).isVisible());
    check('the booking is LATE on the server', (await bookingRow(jobNoShowReport))?.status === 'LATE');
    check('with exactly one LATE event', (await getDb().collection('reliability_events').countDocuments({ bookingId: String((await bookingRow(jobNoShowReport))?._id), type: 'LATE' })) === 1);

    // ---- Flag off: every booking control disappears ----
    console.log('\n--- With the flag off ---\n');
    process.env.BOOKINGS_ENABLED = 'false';
    const { page: off } = await newCustomerPage();
    await off.goto(`${base}/customer/requests`, { waitUntil: 'networkidle' });
    await off.bringToFront();
    await off.waitForSelector(`#job-${jobCode}`, { timeout: 20_000 });
    check('flag off: no booking panel on any request', (await off.locator('[id^="booking-"]').count()) === 0);
    check('flag off: no arrival code', (await off.locator('[id^="arrival-code-"]').count()) === 0);
    check('flag off: the request itself still renders', await off.locator(`#job-${jobCode}`).isVisible());
    await off.goto(`${base}/customer/request/${handle}`, { waitUntil: 'networkidle' });
    await off.waitForSelector('#req-title', { timeout: 20_000 });
    check('flag off: the form does not offer "urgent"', (await off.locator('#req-urgent').count()) === 0);
    process.env.BOOKINGS_ENABLED = 'true';

    // ---- The worker's demo slot ----
    console.log('\n--- The demo slot on the worker screen ---\n');
    const demoJob = await seed('Worker demo slot', 'accepted');
    const workerContext = await browser.newContext({ viewport: { width: 900, height: 1000 } });
    await workerContext.addInitScript(([s, lang]: [string, string]) => {
      localStorage.setItem('kaarigar_lang', lang);
      localStorage.setItem('kaarigar_auth_v1', s);
    }, [session(worker), 'en']);

    const noDemo = await workerContext.newPage();
    await noDemo.goto(`${base}/jobs`, { waitUntil: 'networkidle' });
    await noDemo.waitForSelector(`#pick-time-${demoJob}`, { timeout: 20_000 });
    await noDemo.locator(`#pick-time-${demoJob}`).click();
    await noDemo.waitForSelector(`#slot-picker-${demoJob}`, { timeout: 20_000 });
    check('without BOOKING_DEMO_SLOTS there is no demo slot', (await noDemo.locator(`#slot-window-demo-${demoJob}`).count()) === 0);
    await noDemo.close();

    process.env.BOOKING_DEMO_SLOTS = 'true';
    const withDemo = await workerContext.newPage();
    await withDemo.goto(`${base}/jobs`, { waitUntil: 'networkidle' });
    await withDemo.waitForSelector(`#pick-time-${demoJob}`, { timeout: 20_000 });
    await withDemo.locator(`#pick-time-${demoJob}`).click();
    await withDemo.waitForSelector(`#slot-window-demo-${demoJob}`, { timeout: 20_000 });
    check('with BOOKING_DEMO_SLOTS the demo slot is offered', await withDemo.locator(`#slot-window-demo-${demoJob}`).isVisible());
    check('and labelled as a demo', (await withDemo.locator(`#slot-window-demo-${demoJob}`).innerText()).includes('Demo'));
    await withDemo.locator(`#slot-window-demo-${demoJob}`).click();
    check('the demo slot needs no day to confirm', !(await withDemo.locator(`#slot-confirm-${demoJob}`).isDisabled()));
    const clickedAt = Date.now();
    await withDemo.locator(`#slot-confirm-${demoJob}`).click();
    await withDemo.waitForSelector(`#booking-slot-${demoJob}`, { timeout: 20_000 });
    const demoBooking = await bookingRow(demoJob);
    const leadMin = demoBooking?.slotStart ? (demoBooking.slotStart.getTime() - clickedAt) / MIN : -1;
    check('the demo slot commits a real booking', demoBooking?.status === 'COMMITTED');
    check('starting about two minutes from the tap', leadMin > 1 && leadMin < 3);
    delete process.env.BOOKING_DEMO_SLOTS;

    check('the customer screens produced no uncaught page errors', pageErrors.length === 0);
    if (pageErrors.length > 0) console.error('  page errors:', pageErrors);
  }
} finally {
  console.log('\n--- Cleanup ---\n');
  if (browser) await browser.close();
  try {
    await getDb().dropDatabase();
    console.log(`[test] dropped ${databaseName}`);
  } catch (err) {
    console.error('[test] could not drop the test database:', err);
  }
  await vite.close();
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
