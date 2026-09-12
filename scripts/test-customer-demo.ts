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
