/**
 * The worker's booking screens, driven in a real browser, with the flag ON.
 *
 * WHY THIS EXISTS SEPARATELY from scripts/test-customer-demo.ts: that suite
 * rehearses CUSTOMER_DEMO.md with BOOKINGS_ENABLED off, and must keep doing
 * exactly that - it is the proof the feature is additive. This one turns the
 * flag on and walks the same worker screen through the commitments.
 *
 * It exists at all because of the rule in CLAUDE.md that has already cost this
 * project a release: EVERY SERVER-SIDE REFUSAL NEEDS ITS UI BRANCH IN JobsView.
 * A slot requirement and an arrival code are two new gates on the route the
 * worker screen drives, and a gate with no branch is a button whose only
 * possible outcome is an error - invisible until somebody taps it. The API
 * tests cannot see that; only this can.
 *
 * Three rules inherited from the existing rehearsal, all learned the hard way:
 *   - scope every assertion to #job-card-<id>, never the whole page;
 *   - assert ABSENCE as well as presence;
 *   - bringToFront() before waiting on anything a poll drives.
 *
 *   npx tsx scripts/test-booking-ui.ts
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createServer } from 'vite';

const databaseName = `kg_bui_test_${Date.now()}_${randomBytes(3).toString('hex')}`;
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

import { connectDb, closeDb, getDb } from '../src/server/db';
import { registerRoutes } from '../src/server/routes';
import { PROFILES } from '../src/server/data/profiles';
import { uuidv7 } from '../src/lib/ids';

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

  // The worker needs a passport so the customer can address them by handle.
  await call('/api/passport/me', wt);
  const handle = String((await getDb().collection(PROFILES).findOne({ userId: worker.user.uid }))?.passportHandle ?? '');
  assert.ok(handle, 'the worker should have a passport handle');

  /** A customer request, driven to a named job state via the API. */
  const request = async (id: string, title: string) => {
    const created = await call('/api/customer/jobs', ct, {
      id, kaarigarHandle: handle, title, amount: 500, location: 'Sector 22, Chandigarh',
    });
    assert.equal(created.status, 201, `create ${id}`);
    return id;
  };

  const jobRequested = await request(uuidv7(), 'Booking UI - awaiting reply');
  const jobToSchedule = await request(uuidv7(), 'Booking UI - needs a time');
  const jobToArrive = await request(uuidv7(), 'Booking UI - needs a code');
  const jobLate = await request(uuidv7(), 'Booking UI - running late');

  // Walk three of them forward so the screen shows four different stages at once.
  for (const id of [jobToSchedule, jobToArrive, jobLate]) {
    assert.equal((await call(`/api/jobs/${id}/transition`, wt, { state: 'QUOTED', quotedPrice: 800 })).status, 200);
    assert.equal((await call(`/api/customer/jobs/${id}/accept`, ct, {})).status, 200);
  }

  const slotStart = new Date(Date.now() + 26 * HOUR);
  const slotEnd = new Date(slotStart.getTime() + 2 * HOUR);
  for (const id of [jobToArrive, jobLate]) {
    const scheduled = await call(`/api/jobs/${id}/transition`, wt, {
      state: 'SCHEDULED',
      slotStart: slotStart.toISOString(),
      slotEnd: slotEnd.toISOString(),
    });
    assert.equal(scheduled.status, 200, `schedule ${id}`);
  }

  /**
   * Force one booking into LATE by moving its arriveBy into the past, then
   * letting the ordinary read-path sweep notice. The clock is never faked in
   * the browser - the SERVER's own rule does the transition, which is the only
   * version of this worth asserting on.
   */
  await getDb().collection('bookings').updateOne(
    { jobId: jobLate },
    { $set: { arriveBy: new Date(Date.now() - HOUR), slotStart: new Date(Date.now() - 4 * HOUR), slotEnd: new Date(Date.now() - 2 * HOUR) } }
  );
  await call('/api/jobs', wt); // a list read applies overdue rules
  check('the server marked the overdue booking LATE', (await getDb().collection('bookings').findOne({ jobId: jobLate }))?.status === 'LATE');

  // A legacy job: the worker's own record, with no booking anywhere.
  const legacyId = uuidv7();
  assert.equal((await call('/api/jobs', wt, { id: legacyId, title: 'Booking UI - own record', amount: 900, customerName: 'Walk-in', location: 'Sector 17' })).status, 201);
  check('the legacy job really has no booking', (await getDb().collection('bookings').findOne({ jobId: legacyId })) === null);

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
      console.log('  Install Microsoft Edge, or set SKIP_BROWSER_CHECKS=true to silence this.');
    }
  }

  if (browser) {
    const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
    await context.addInitScript(([session, lang]: [string, string]) => {
      localStorage.setItem('kaarigar_lang', lang);
      localStorage.setItem('kaarigar_auth_v1', session);
    }, [JSON.stringify({
      accessToken: wt,
      refreshToken: worker.refreshToken,
      expiresAt: Date.now() + 15 * 60 * 1000,
      user: worker.user,
    }), 'en']);

    const w = await context.newPage();
    const pageErrors: string[] = [];
    w.on('pageerror', (e: Error) => pageErrors.push(e.message));
    await w.goto(`${base}/jobs`, { waitUntil: 'networkidle' });
    await w.bringToFront();
    await w.waitForSelector(`#job-card-${jobRequested}`, { timeout: 20_000 });

    /** Every assertion is scoped to one card. The list holds six by now. */
    const card = (id: string) => w.locator(`#job-card-${id}`);

    // ---- A new request: countdown, price box, Decline ----
    console.log('\n--- An unanswered request ---\n');
    check('a new request shows a reply countdown', await card(jobRequested).locator(`#booking-respondby-${jobRequested}`).isVisible());
    const respondText = await card(jobRequested).locator(`#booking-respondby-${jobRequested}`).innerText();
    check('the countdown names a real duration', /Reply within \d+(h \d+m|m)/.test(respondText));
    check('a new request still offers the price box', await card(jobRequested).locator(`#quote-${jobRequested}`).isVisible());
    check('a new request offers Decline', await card(jobRequested).locator(`#decline-${jobRequested}`).isVisible());
    check('the booking state is named on the card', (await card(jobRequested).locator(`#booking-state-${jobRequested}`).innerText()).includes('Awaiting your reply'));

    // Decline asks before it acts, and can be backed out of.
    await card(jobRequested).locator(`#decline-${jobRequested}`).click();
    check('Decline asks for confirmation first', await card(jobRequested).locator(`#confirm-panel-${jobRequested}`).isVisible());
    check('the confirmation explains what the customer will be told', (await card(jobRequested).locator(`#confirm-panel-${jobRequested}`).innerText()).includes('customer'));
    await card(jobRequested).getByRole('button', { name: 'Keep it' }).click();
    check('backing out leaves the request alone', !(await card(jobRequested).locator(`#confirm-panel-${jobRequested}`).isVisible()));
    check('and the request is still there', await card(jobRequested).locator(`#quote-${jobRequested}`).isVisible());

    // ---- Price agreed: the slot picker replaces the one-tap advance ----
    console.log('\n--- Committing to a time ---\n');
    check('an agreed job shows a countdown to pick a time', await card(jobToSchedule).locator(`#booking-scheduleby-${jobToSchedule}`).isVisible());
    check('an agreed job offers Pick a time', await card(jobToSchedule).locator(`#pick-time-${jobToSchedule}`).isVisible());
    check('and does NOT offer the one-tap Schedule job', !(await card(jobToSchedule).getByRole('button', { name: 'Schedule job' }).isVisible()));

    await card(jobToSchedule).locator(`#pick-time-${jobToSchedule}`).click();
    check('Pick a time opens the slot picker', await card(jobToSchedule).locator(`#slot-picker-${jobToSchedule}`).isVisible());
    check('Confirm is disabled until a day and a window are chosen', await card(jobToSchedule).locator(`#slot-confirm-${jobToSchedule}`).isDisabled());

    const tomorrow = new Date(Date.now() + 24 * HOUR);
    const pad = (n: number) => String(n).padStart(2, '0');
    const tomorrowValue = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
    await card(jobToSchedule).locator(`#slot-date-${jobToSchedule}`).fill(tomorrowValue);
    await card(jobToSchedule).locator(`#slot-window-morning-${jobToSchedule}`).click();
    check('Confirm becomes available once both are chosen', !(await card(jobToSchedule).locator(`#slot-confirm-${jobToSchedule}`).isDisabled()));

    await card(jobToSchedule).locator(`#slot-confirm-${jobToSchedule}`).click();
    await w.waitForSelector(`#booking-slot-${jobToSchedule}`, { timeout: 20_000 });
    check('committing shows the agreed time on the card', (await card(jobToSchedule).locator(`#booking-slot-${jobToSchedule}`).innerText()).includes('Agreed time'));
    check('and an arrival countdown appears', await card(jobToSchedule).locator(`#booking-arriveby-${jobToSchedule}`).isVisible());
    // Waited for, not asserted instantly - same reason as the code box below:
    // the panel closes after the transition resolves, one refresh later than
    // the card's own text updates.
    await w.waitForSelector(`#slot-picker-${jobToSchedule}`, { state: 'hidden', timeout: 20_000 });
    check('and the slot picker closes', (await card(jobToSchedule).locator(`#slot-picker-${jobToSchedule}`).count()) === 0);
    check('the server really committed the slot', (await getDb().collection('bookings').findOne({ jobId: jobToSchedule }))?.status === 'COMMITTED');

    // ---- Arrival: the code box replaces the one-tap advance ----
    console.log('\n--- The arrival code ---\n');
    check('a committed job offers the arrival button', await card(jobToArrive).locator(`#arrived-${jobToArrive}`).isVisible());
    check('and does NOT offer the one-tap Start work', !(await card(jobToArrive).getByRole('button', { name: 'Start work' }).isVisible()));
    check('a committed job offers Change the time', await card(jobToArrive).locator(`#reschedule-${jobToArrive}`).isVisible());
    check('a committed job offers Cancel', await card(jobToArrive).locator(`#cancel-${jobToArrive}`).isVisible());

    await card(jobToArrive).locator(`#arrived-${jobToArrive}`).click();
    check('the arrival button opens the code box', await card(jobToArrive).locator(`#otp-panel-${jobToArrive}`).isVisible());
    check('the code box explains where the code comes from', (await card(jobToArrive).locator(`#otp-panel-${jobToArrive}`).innerText()).includes('customer'));
    check('Confirm is disabled until four digits are entered', await card(jobToArrive).locator(`#otp-submit-${jobToArrive}`).isDisabled());

    // A wrong code must be REFUSED ON THE CARD, not swallowed or shown as a
    // generic failure at the top of the screen.
    const realOtp = (await call(`/api/bookings/${String((await getDb().collection('bookings').findOne({ jobId: jobToArrive }))?._id)}/otp`, ct)).body.otp as string;
    const wrongOtp = realOtp === '0000' ? '1111' : '0000';
    await card(jobToArrive).locator(`#otp-${jobToArrive}`).fill(wrongOtp);
    await card(jobToArrive).locator(`#otp-submit-${jobToArrive}`).click();
    await w.waitForSelector(`#booking-error-${jobToArrive}`, { timeout: 20_000 });
    check('a wrong code is refused on the card', (await card(jobToArrive).locator(`#booking-error-${jobToArrive}`).innerText()).includes('not right'));
    check('the code box stays open after a wrong code', await card(jobToArrive).locator(`#otp-panel-${jobToArrive}`).isVisible());
    check('the wrong digits are cleared for another try', (await card(jobToArrive).locator(`#otp-${jobToArrive}`).inputValue()) === '');
    check('the job did not advance on a wrong code', (await getDb().collection('bookings').findOne({ jobId: jobToArrive }))?.status === 'COMMITTED');

    await card(jobToArrive).locator(`#otp-${jobToArrive}`).fill(realOtp);
    await card(jobToArrive).locator(`#otp-submit-${jobToArrive}`).click();
    await w.waitForSelector(`#job-card-${jobToArrive} #booking-state-${jobToArrive}`, { timeout: 20_000 });
    await w.waitForFunction(
      (id: string) => document.querySelector(`#booking-state-${id}`)?.textContent?.includes('You arrived') ?? false,
      jobToArrive,
      { timeout: 20_000 }
    );
    check('the right code checks the worker in', (await getDb().collection('bookings').findOne({ jobId: jobToArrive }))?.status === 'ARRIVED');
    check('the card says the worker arrived', (await card(jobToArrive).locator(`#booking-state-${jobToArrive}`).innerText()).includes('You arrived'));
    /*
      WAITED FOR, NOT ASSERTED INSTANTLY. The panel closes after the transition
      resolves, and handleTransitionJob refreshes the trust score between the
      booking update and that close - so the card can legitimately read "You
      arrived" for a moment while the box is still open. An immediate isVisible()
      here failed against correct code, which is the same class of mistake the
      rehearsal notes in CLAUDE.md warn about.
    */
    await w.waitForSelector(`#otp-panel-${jobToArrive}`, { state: 'hidden', timeout: 20_000 });
    check('the code box closes on success', (await card(jobToArrive).locator(`#otp-panel-${jobToArrive}`).count()) === 0);

    // ---- LATE: the banner, and the still-open door ----
    console.log('\n--- The LATE state ---\n');
    check('a late job shows the red banner', await card(jobLate).locator(`#booking-late-${jobLate}`).isVisible());
    check('the banner tells the worker what to do', (await card(jobLate).locator(`#booking-late-${jobLate}`).innerText()).includes('enter their code'));
    check('a late job still offers the arrival button', await card(jobLate).locator(`#arrived-${jobLate}`).isVisible());
    check('a late job does NOT offer Change the time', !(await card(jobLate).locator(`#reschedule-${jobLate}`).isVisible()));
    check('and says why the time can no longer be changed', await card(jobLate).locator(`#booking-no-reschedule-${jobLate}`).isVisible());
    check('the reason names the notice period, not a generic refusal', (await card(jobLate).locator(`#booking-no-reschedule-${jobLate}`).innerText()).includes('too close to the slot'));

    // ---- The legacy job: untouched by any of this ----
    console.log('\n--- A legacy job keeps the old screen ---\n');
    check('a legacy job shows no booking panel at all', (await card(legacyId).locator(`#booking-${legacyId}`).count()) === 0);
    check('a legacy job shows no reply countdown', (await card(legacyId).locator(`#booking-respondby-${legacyId}`).count()) === 0);
    check('a legacy job shows no slot', (await card(legacyId).locator(`#booking-slot-${legacyId}`).count()) === 0);
    check('a legacy job offers the one-tap advance', await card(legacyId).getByRole('button', { name: 'Mark quote sent' }).isVisible());
    check('a legacy job offers no arrival code button', (await card(legacyId).locator(`#arrived-${legacyId}`).count()) === 0);

    // ---- The code must never be on the worker's screen ----
    console.log('\n--- The arrival code is never on this screen ---\n');
    const html = await w.content();
    check('the page HTML contains no otpHash', !/otphash/i.test(html));
    check('the page HTML does not contain the real arrival code as a field', !/"otp"\s*:/i.test(html));
    const otpBoxValue = await card(jobLate).locator(`#job-card-${jobLate}`).count();
    check('no card renders a pre-filled code', otpBoxValue >= 0 && !new RegExp(`value="${realOtp}"`).test(html));

    check('the worker rehearsal produced no uncaught page errors', pageErrors.length === 0);
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
