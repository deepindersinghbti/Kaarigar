/** Isolated customer/worker integration test. Never uses the saved demo database. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import express from 'express';
import { createServer } from 'vite';
import { connectDb, closeDb, getDb } from '../src/server/db';
import { registerRoutes } from '../src/server/routes';
import { signAccessToken } from '../src/server/auth/tokens';
import { demoCustomerEnabled } from '../src/server/auth/demoCustomer';

const databaseName = `kg_cust_test_${Date.now()}_${randomBytes(3).toString('hex')}`;
process.env.MONGODB_DB_NAME = databaseName;
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.NODE_ENV = 'development';
process.env.VITE_USE_API = 'all';
process.env.DEMO_OTP_ENABLED = 'true';
process.env.DEMO_OTP_CODE = '111111';
const customerCode = String(randomInt(200000, 999999));
process.env.DEMO_CUSTOMER_OTP_CODE = customerCode;
const workerPhone = '+919876543210';
const customerPhone = '+910123456789';
let checks = 0;
function check(label: string, value: unknown) { assert.ok(value, label); console.log(`PASS ${++checks}: ${label}`); }

const db = await connectDb();
assert.ok(db, 'Test database must connect');
assert.equal(db.databaseName, databaseName);
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
async function call(path: string, token = '', body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function login(phone: string, code?: string) {
  const challenge = await call('/api/auth/otp/request', '', { phone });
  assert.equal(challenge.status, 201);
  const result = await call('/api/auth/otp/verify', '', { challengeId: challenge.body.challengeId, code: code ?? challenge.body.devCode });
  assert.equal(result.status, 200);
  return result.body;
}
let browser: any;
try {
  process.env.DEMO_CUSTOMER_OTP_CODE = '';
  check('unconfigured customer demo fails closed', (await call('/api/auth/otp/request', '', { phone: customerPhone })).status === 503);
  process.env.DEMO_CUSTOMER_OTP_CODE = process.env.DEMO_OTP_CODE;
  check('customer cannot reuse the worker demo code', !demoCustomerEnabled());
  process.env.DEMO_CUSTOMER_OTP_CODE = customerCode;
  const worker = await login(workerPhone);
  const customer = await login(customerPhone, customerCode);
  check('separate UIDs and server-assigned roles', worker.user.uid !== customer.user.uid && worker.user.roles.join() === 'kaarigar' && customer.user.roles.join() === 'customer');
  const wrong = await call('/api/auth/otp/request', '', { phone: customerPhone });
  check('demo challenge never discloses a code', !wrong.body.devCode && wrong.body.delivery === 'customer_demo_code');
  check('worker code rejected for Neha', (await call('/api/auth/otp/verify', '', { challengeId: wrong.body.challengeId, code: '111111' })).status === 401);
  const wt = worker.accessToken;
  const ct = customer.accessToken;
  for (const [path, body] of [
    ['/api/passport/me', undefined], ['/api/jobs', undefined], ['/api/jobs', { title: 'fake', amount: 1 }],
    ['/api/ledger/entries', {}], ['/api/sync/batch', {}], ['/api/assistant/process', {}],
    ['/api/jobs/fake/transition', {}], ['/api/reviews/link', {}], ['/api/quotes/share', {}],
  ] as const) check(`customer blocked from ${path}`, (await call(path, ct, body)).status === 403);
  check('worker blocked from customer requests', (await call('/api/customer/jobs', wt)).status === 403);
  check('unauthenticated customer request blocked', (await call('/api/customer/jobs')).status === 401);
  const profile = await call('/api/passport/me', wt);
  assert.equal(profile.status, 201);
  await call('/api/passport/me', wt, { name: 'Ramesh Kumar', trade: 'Electrician', location: 'Sector 35, Chandigarh' }, 'PATCH');
  check('Neha never receives a worker passport', await getDb().collection('kaarigar_profiles').countDocuments({ userId: customer.user.uid }) === 0);
  const handle = profile.body.profile.passportHandle;
  const input = { id: 'customer-demo-request', kaarigarHandle: handle, title: 'Fan installation', customerName: 'Forged name', customerId: worker.user.uid, amount: 1100, paymentMethod: 'upi', agreedPrice: 1, location: 'Sector 35, Chandigarh' };
  const created = await call('/api/customer/jobs', ct, input);
  check('customer request created for the selected worker', created.status === 201 && created.body.job.kaarigarId === worker.user.uid);
  check('server fixes identity and pending payment', created.body.job.customerId === customer.user.uid && created.body.job.customerName === 'Neha Sharma' && created.body.job.paymentMethod === 'pending' && created.body.job.agreedPrice === undefined);
  check('request starts REQUESTED and records customer actor', created.body.job.status === 'REQUESTED' && created.body.job.stateHistory[0].by === customer.user.uid);
  check('retry is idempotent', (await call('/api/customer/jobs', ct, input)).status === 200);
  const otherCustomer = signAccessToken({ uid: 'isolated-other-customer', phone: '+919000000099', roles: ['customer'] });
  check('another customer cannot retrieve same-worker job via ID collision', (await call('/api/customer/jobs', otherCustomer, input)).status === 409);
  check('other customer sees no Neha requests', (await call('/api/customer/jobs', otherCustomer)).body.jobs.length === 0);
  check('both actors see the same job ID', (await call('/api/jobs', wt)).body.jobs.some((j: any) => j.id === input.id) && (await call('/api/customer/jobs', ct)).body.jobs.some((j: any) => j.id === input.id));
  const ownJob = await call('/api/jobs', wt, { title: 'Self recorded', amount: 100, customerId: customer.user.uid });
  check('worker cannot attach self-recorded job to Neha', ownJob.status === 201 && !ownJob.body.job.customerId);
  // --- Quote handshake: worker names a price, customer alone accepts it -----
  check('QUOTED needs a price', (await call(`/api/jobs/${input.id}/transition`, wt, { state: 'QUOTED' })).status === 400);
  check('zero and negative prices refused', (await call(`/api/jobs/${input.id}/transition`, wt, { state: 'QUOTED', quotedPrice: 0 })).status === 400
    && (await call(`/api/jobs/${input.id}/transition`, wt, { state: 'QUOTED', quotedPrice: -5 })).status === 400);
  check('price refused on an unrelated edge', (await call(`/api/jobs/${input.id}/transition`, wt, { state: 'CANCELLED', quotedPrice: 500 })).status === 400);
  check('customer cannot quote their own request', (await call(`/api/jobs/${input.id}/transition`, ct, { state: 'QUOTED', quotedPrice: 1 })).status === 403);
  const quoted = await call(`/api/jobs/${input.id}/transition`, wt, { state: 'QUOTED', quotedPrice: 1450 });
  check('worker quotes a price', quoted.status === 200 && quoted.body.job.status === 'QUOTED' && quoted.body.job.quotedPrice === 1450);
  check('quoting alone agrees nothing', quoted.body.job.agreedPrice == null);
  check('worker cannot accept on the customer behalf', (await call(`/api/jobs/${input.id}/transition`, wt, { state: 'ACCEPTED' })).status === 403);
  check('another customer cannot accept this quote', (await call(`/api/customer/jobs/${input.id}/accept`, otherCustomer, undefined, 'POST')).status === 404);
  check('worker blocked from the accept route', (await call(`/api/customer/jobs/${input.id}/accept`, wt, undefined, 'POST')).status === 403);
  // The price is not a parameter: a body naming a different figure changes nothing.
  const accepted = await call(`/api/customer/jobs/${input.id}/accept`, ct, { quotedPrice: 1, agreedPrice: 1, amount: 1 }, 'POST');
  check('customer accepts and the agreed price is the quoted one', accepted.status === 200 && accepted.body.job.status === 'ACCEPTED' && accepted.body.job.agreedPrice === 1450);
  check('a customer-supplied price is ignored', accepted.body.job.quotedPrice === 1450);
  const history = accepted.body.job.stateHistory;
  check('acceptance is recorded as the customer acting', history[history.length - 1].state === 'ACCEPTED' && history[history.length - 1].by === customer.user.uid);
  const replay = await call(`/api/customer/jobs/${input.id}/accept`, ct, undefined, 'POST');
  check('accepting twice is idempotent, not an error', replay.status === 200 && replay.body.alreadyAccepted === true && replay.body.job.agreedPrice === 1450);
  check('worker sees the agreed price on their own copy', (await call('/api/jobs', wt)).body.jobs.find((j: any) => j.id === input.id).agreedPrice === 1450);
  const notQuoted = { ...input, id: 'customer-demo-request-2', title: 'Second request' };
  await call('/api/customer/jobs', ct, notQuoted);
  check('a request with no quote cannot be accepted', (await call(`/api/customer/jobs/${notQuoted.id}/accept`, ct, undefined, 'POST')).status === 409);
  check('accepting an unknown job is a 404', (await call('/api/customer/jobs/no-such-job/accept', ct, undefined, 'POST')).status === 404);

  // Decline: the price is refused, the job is not. It returns to REQUESTED with
  // the withdrawn quote cleared, and the worker can quote again down the edge
  // that already existed.
  check('a request with no quote cannot be declined', (await call(`/api/customer/jobs/${notQuoted.id}/decline`, ct, undefined, 'POST')).status === 409);
  check('declining an unknown job is a 404', (await call('/api/customer/jobs/no-such-job/decline', ct, undefined, 'POST')).status === 404);
  const toDecline = { ...input, id: 'customer-demo-request-3', title: 'Third request' };
  await call('/api/customer/jobs', ct, toDecline);
  await call(`/api/jobs/${toDecline.id}/transition`, wt, { state: 'QUOTED', quotedPrice: 9000 });
  check('worker blocked from the decline route', (await call(`/api/customer/jobs/${toDecline.id}/decline`, wt, undefined, 'POST')).status === 403);
  check('another customer cannot decline this quote', (await call(`/api/customer/jobs/${toDecline.id}/decline`, otherCustomer, undefined, 'POST')).status === 404);
  const declined = await call(`/api/customer/jobs/${toDecline.id}/decline`, ct, { quotedPrice: 10, agreedPrice: 10 }, 'POST');
  check('decline returns the request to REQUESTED', declined.status === 200 && declined.body.job.status === 'REQUESTED');
  check('decline clears the withdrawn quote', declined.body.job.quotedPrice == null);
  check('decline agrees to nothing', declined.body.job.agreedPrice == null);
  const dHistory = declined.body.job.stateHistory;
  check('decline is recorded as the customer acting', dHistory[dHistory.length - 1].state === 'REQUESTED' && dHistory[dHistory.length - 1].by === customer.user.uid);
  check('declining twice is idempotent, not an error', (await call(`/api/customer/jobs/${toDecline.id}/decline`, ct, undefined, 'POST')).body.alreadyDeclined === true);
  const requoted = await call(`/api/jobs/${toDecline.id}/transition`, wt, { state: 'QUOTED', quotedPrice: 800 });
  check('worker can quote again after a decline', requoted.status === 200 && requoted.body.job.quotedPrice === 800);
  check('the second quote is the one that can be accepted', (await call(`/api/customer/jobs/${toDecline.id}/accept`, ct, undefined, 'POST')).body.job.agreedPrice === 800);
  // A customer-linked job sent back to REQUESTED by the WORKER must clear the
  // price too, or quoted_price_required reads as satisfied on a withdrawn quote.
  const withdraw = { ...input, id: 'customer-demo-request-4', title: 'Fourth request' };
  await call('/api/customer/jobs', ct, withdraw);
  await call(`/api/jobs/${withdraw.id}/transition`, wt, { state: 'QUOTED', quotedPrice: 700 });
  const pulled = await call(`/api/jobs/${withdraw.id}/transition`, wt, { state: 'REQUESTED' });
  check('worker withdrawing a quote also clears the price', pulled.status === 200 && pulled.body.job.quotedPrice == null);

  // Cancel: narrower than JOB_TRANSITIONS on purpose - the customer's button
  // stops at ACCEPTED, though the worker's route still cancels later states.
  check('cancelling an unknown job is a 404', (await call('/api/customer/jobs/no-such-job/cancel', ct, undefined, 'POST')).status === 404);
  check('worker blocked from the cancel route', (await call(`/api/customer/jobs/${withdraw.id}/cancel`, wt, undefined, 'POST')).status === 403);
  check('another customer cannot cancel this request', (await call(`/api/customer/jobs/${withdraw.id}/cancel`, otherCustomer, undefined, 'POST')).status === 404);
  const cancelled = await call(`/api/customer/jobs/${withdraw.id}/cancel`, ct, undefined, 'POST');
  check('customer cancels a REQUESTED request', cancelled.status === 200 && cancelled.body.job.status === 'CANCELLED');
  const cHistory = cancelled.body.job.stateHistory;
  check('cancellation is recorded as the customer acting', cHistory[cHistory.length - 1].state === 'CANCELLED' && cHistory[cHistory.length - 1].by === customer.user.uid);
  check('cancelling twice is idempotent, not an error', (await call(`/api/customer/jobs/${withdraw.id}/cancel`, ct, undefined, 'POST')).body.alreadyCancelled === true);
  check('a cancelled request can no longer be accepted', (await call(`/api/customer/jobs/${withdraw.id}/accept`, ct, undefined, 'POST')).status === 409);
  // input.id is ACCEPTED, so it is still inside the customer's window.
  const lateCancel = { ...input, id: 'customer-demo-request-5', title: 'Fifth request' };
  await call('/api/customer/jobs', ct, lateCancel);
  await call(`/api/jobs/${lateCancel.id}/transition`, wt, { state: 'QUOTED', quotedPrice: 500 });
  await call(`/api/customer/jobs/${lateCancel.id}/accept`, ct, undefined, 'POST');
  check('customer can still cancel an ACCEPTED request', (await call(`/api/customer/jobs/${lateCancel.id}/cancel`, ct, undefined, 'POST')).status === 200);
  const started = { ...input, id: 'customer-demo-request-6', title: 'Sixth request' };
  await call('/api/customer/jobs', ct, started);
  await call(`/api/jobs/${started.id}/transition`, wt, { state: 'QUOTED', quotedPrice: 500 });
  await call(`/api/customer/jobs/${started.id}/accept`, ct, undefined, 'POST');
  await call(`/api/jobs/${started.id}/transition`, wt, { state: 'SCHEDULED' });
  const tooLate = await call(`/api/customer/jobs/${started.id}/cancel`, ct, undefined, 'POST');
  check('customer cannot cancel once the kaarigar has scheduled', tooLate.status === 409 && tooLate.body.error === 'not_cancellable');
  check('the worker can still cancel a scheduled job', (await call(`/api/jobs/${started.id}/transition`, wt, { state: 'CANCELLED' })).status === 200);
  // A worker's own unlinked job keeps the one-tap path: nobody else can agree.
  const soloNoPrice = await call('/api/jobs', wt, { title: 'Self recorded, unpriced', amount: 70 });
  check('worker own job quotes with no price at all', (await call(`/api/jobs/${soloNoPrice.body.job.id}/transition`, wt, { state: 'QUOTED' })).status === 200);
  const solo = await call(`/api/jobs/${ownJob.body.job.id}/transition`, wt, { state: 'QUOTED', quotedPrice: 300 });
  check('worker own job still quotes', solo.status === 200 && solo.body.job.quotedPrice === 300);
  check('worker own job still self-accepts', (await call(`/api/jobs/${ownJob.body.job.id}/transition`, wt, { state: 'ACCEPTED' })).status === 200);

  // The kaarigar on each request, and the phone gate. Name/handle/trade always;
  // the number only once the job is ACCEPTED or later.
  const listed = (await call('/api/customer/jobs', ct)).body.jobs;
  const findJob = (id: string) => listed.find((j: any) => j.id === id);
  check('each request names the kaarigar it went to', listed.every((j: any) => j.kaarigar && j.kaarigar.name && j.kaarigar.passportHandle));
  check('the kaarigar shown is the one asked', findJob(input.id).kaarigar.passportHandle === handle);
  const quotedOnly = { ...input, id: 'customer-demo-request-7', title: 'Seventh request' };
  await call('/api/customer/jobs', ct, quotedOnly);
  check('no phone on a REQUESTED job', findJob(notQuoted.id).kaarigar.phone === undefined);
  await call(`/api/jobs/${quotedOnly.id}/transition`, wt, { state: 'QUOTED', quotedPrice: 400 });
  const afterQuote = (await call('/api/customer/jobs', ct)).body.jobs.find((j: any) => j.id === quotedOnly.id);
  check('no phone on a QUOTED job', afterQuote.kaarigar.phone === undefined);
  await call(`/api/customer/jobs/${quotedOnly.id}/accept`, ct, undefined, 'POST');
  const afterAccept = (await call('/api/customer/jobs', ct)).body.jobs.find((j: any) => j.id === quotedOnly.id);
  check('phone released once ACCEPTED', typeof afterAccept.kaarigar.phone === 'string' && afterAccept.kaarigar.phone.length > 0);
  check('no phone on a CANCELLED job', findJob(withdraw.id).kaarigar.phone === undefined);
  // The join must not leak the fields the public projection withholds.
  check('the join carries nothing beyond handle, name, trade, phone',
    listed.every((j: any) => Object.keys(j.kaarigar).every((k) => ['passportHandle', 'name', 'trade', 'phone'].includes(k))));
  check('no earnings, rate or blood group on the join',
    listed.every((j: any) => j.kaarigar.totalEarnings === undefined && j.kaarigar.dailyRate === undefined && j.kaarigar.bloodGroup === undefined));
  // The browse directory is unchanged by any of this.
  check('browse directory still withholds phone',
    (await call('/api/kaarigars', ct)).body.kaarigars.every((k: any) => k.phone === undefined && k.totalEarnings === undefined));

  const refresh = await call('/api/auth/refresh', '', { refreshToken: customer.refreshToken });
  check('refresh preserves customer access restrictions', refresh.status === 200 && (await call('/api/passport/me', refresh.body.accessToken)).status === 403);

  if (process.env.PLAYWRIGHT_MODULE) {
    const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => localStorage.setItem('kaarigar_lang', 'en'));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.goto(base);
    await page.locator('#entry-customer-button').click();
    await page.locator('#login-phone').waitFor();
    check('customer card navigates to customer login', new URL(page.url()).pathname === '/customer');
    await page.goBack();
    await page.locator('#entry-customer-button').waitFor();
    check('browser Back returns to role selection', new URL(page.url()).pathname === '/');
    await page.goForward();
    await page.locator('#login-phone').fill('0123456789');
    await page.getByRole('button', { name: 'Continue to demo code', exact: true }).click();
    await page.locator('#login-code').fill(customerCode);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('link', { name: 'My requests', exact: true }).waitFor();
    check('customer browser login reaches customer app', true);
    await page.getByRole('button').filter({ hasText: 'Ramesh Kumar' }).click();
    await page.locator('#req-title').waitFor();
    await page.reload();
    await page.locator('#req-title').waitFor();
    check('refresh retains customer request route', new URL(page.url()).pathname === `/customer/request/${handle}`);
    await page.locator('#req-title').fill('Browser fan installation');
    await page.locator('#req-location').fill('Sector 35, Chandigarh');
    await page.locator('#req-amount').fill('1100');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/customer/requests');
    await page.getByText('Browser fan installation', { exact: true }).waitFor();
    check('browser request submits and appears in customer list', true);
    check('browser-created request appears for worker', (await call('/api/jobs', wt)).body.jobs.some((j: any) => j.title === 'Browser fan installation'));
    await page.goBack();
    await page.locator('#req-title').waitFor();
    await page.goBack();
    await page.getByRole('button').filter({ hasText: 'Ramesh Kumar' }).waitFor();
    check('request list → Back → form → Back → browse', new URL(page.url()).pathname === '/customer');
    await page.goto(base + '/jobs');
    await page.waitForURL('**/customer');
    check('customer worker URL redirects to customer app', true);
    const workerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await workerContext.addInitScript(() => localStorage.setItem('kaarigar_lang', 'en'));
    const workerPage = await workerContext.newPage();
    await workerPage.goto(base);
    await workerPage.locator('#entry-kaarigar-button').click();
    await workerPage.locator('#login-phone').fill('9876543210');
    const workerChallenge = workerPage.waitForResponse((response: any) => response.url().endsWith('/api/auth/otp/request'));
    await workerPage.getByRole('button', { name: 'Send code', exact: true }).click();
    const workerCode = (await (await workerChallenge).json()).devCode;
    await workerPage.locator('#login-code').fill(workerCode);
    await workerPage.getByRole('button', { name: 'Continue', exact: true }).click();
    await workerPage.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
    await workerPage.goto(base + '/jobs');
    await workerPage.getByText('Browser fan installation', { exact: true }).waitFor();
    check('separate worker browser sees Neha request', true);
    check('worker login does not replace Neha session in her browser', await page.getByRole('link', { name: 'My requests', exact: true }).isVisible());
    await workerPage.goto(base + '/customer');
    await workerPage.waitForURL(base + '/');
    check('worker customer URL redirects to worker app', true);
    await workerContext.close();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.locator('#entry-customer-button').waitFor();
    await page.goto(base + '/customer/requests');
    await page.locator('#login-phone').waitFor();
    check('sign-out protects previous customer routes', true);
    check('customer browser has no uncaught page errors', errors.length === 0);
    await context.close();
  } else console.log('SKIP browser checks: set PLAYWRIGHT_MODULE to the installed Playwright entry file.');
  console.log(`Completed ${checks} customer-demo checks.`);
  if (process.env.RUN_WORKER_REGRESSIONS === 'true') {
    const result = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/test-regressions.ts'], {
        env: { ...process.env, TEST_BASE_URL: base }, stdio: 'inherit', windowsHide: true,
      });
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(result, 0, 'Existing worker regressions must pass');
  }
} finally {
  await browser?.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  // Only this run's randomly named test database is disposable.
  assert.equal(getDb().databaseName, databaseName);
  assert.match(databaseName, /^kg_cust_test_\d+_[a-f0-9]{6}$/);
  await getDb().dropDatabase();
  await closeDb();
}
