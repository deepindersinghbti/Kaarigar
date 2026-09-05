/**
 * Regression tests for defects that were fixed and could silently return.
 *
 * Owner: Track A. Run against a live dev server:  npm run test:regressions
 *
 * Not a general test suite - the repo has no framework and adding one is its
 * own decision. These are specifically the bugs where a plausible future
 * refactor reintroduces them without any type error or obvious symptom.
 *
 * Exits non-zero on failure so it can gate a commit or a CI step.
 */

import dotenv from 'dotenv';
dotenv.config();

import { resolveDemoOtp, demoOtpAccepts } from '../src/server/auth/demoOtp';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function login(phone: string): Promise<string> {
  const reqRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const challenge = await reqRes.json();
  if (!challenge.devCode) {
    throw new Error(`otp/request gave no devCode (NODE_ENV must not be production): ${JSON.stringify(challenge)}`);
  }
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId: challenge.challengeId, code: challenge.devCode }),
  });
  const { accessToken } = await verifyRes.json();
  // Ensure a passport exists so ledger writes are not blocked on no_profile.
  await fetch(`${BASE}/api/passport/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return accessToken;
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

async function main() {
  console.log(`\nRegression tests against ${BASE}\n`);

  const stamp = Date.now().toString().slice(-8);
  const a = await login(`+9198${stamp}`);
  const b = await login(`+9197${stamp}`);

  // ---------------------------------------------------------------------
  // Cross-user id collision.
  //
  // Was: the idempotency lookup was scoped by owner, so another user's id
  // looked absent, the insert fell through, and Mongo's collection-wide unique
  // _id produced a 500 that the outbox retried forever.
  //
  // A refactor that "tidies" the lookup by adding the owner back into the query
  // reintroduces this with no type error and no obvious symptom.
  // ---------------------------------------------------------------------
  console.log('cross-user id collision');

  const jobId = `01a05000-0000-7000-8000-${stamp}0001`;
  const mk = (title: string) => JSON.stringify({ id: jobId, title, amount: 100 });

  const aCreate = await fetch(`${BASE}/api/jobs`, { method: 'POST', headers: auth(a), body: mk('A job') });
  check('owner can create', aCreate.status === 201, `got ${aCreate.status}`);
  const aCreateBody = await aCreate.json();
  check('new job starts at REQUESTED',
    aCreateBody.job?.status === 'REQUESTED'
      && aCreateBody.job?.stateHistory?.length === 1
      && aCreateBody.job?.stateHistory?.[0]?.state === 'REQUESTED',
    JSON.stringify(aCreateBody.job));

  const aReplay = await fetch(`${BASE}/api/jobs`, { method: 'POST', headers: auth(a), body: mk('A job') });
  const aReplayBody = await aReplay.json();
  check('owner replay is idempotent, not a conflict',
    aReplay.status === 200 && aReplayBody.idempotentReplay === true,
    `got ${aReplay.status} ${JSON.stringify(aReplayBody).slice(0, 80)}`);

  const bCollide = await fetch(`${BASE}/api/jobs`, { method: 'POST', headers: auth(b), body: mk('B job') });
  const bBody = await bCollide.json();
  check('other user gets 409, not 500', bCollide.status === 409, `got ${bCollide.status}`);
  check('409 body does not disclose ownership',
    !/another user|owned by|belongs to/i.test(JSON.stringify(bBody)),
    JSON.stringify(bBody));

  // ---------------------------------------------------------------------
  // Lifecycle integrity. Creating completed evidence is forbidden; every
  // happy-path state must be accepted exactly one legal edge at a time.
  // ---------------------------------------------------------------------
  console.log('\njob lifecycle integrity');

  const bypassId = `01a05000-0000-7000-8000-${stamp}0003`;
  const bypass = await fetch(`${BASE}/api/jobs`, {
    method: 'POST',
    headers: auth(a),
    body: JSON.stringify({ id: bypassId, title: 'Forged completed job', amount: 900, status: 'COMPLETED' }),
  });
  check('cannot create completed-work evidence', bypass.status === 400, `got ${bypass.status}`);

  const afterBypass = await (await fetch(`${BASE}/api/jobs`, { headers: auth(a) })).json();
  check('rejected completed job was not inserted',
    !afterBypass.jobs?.some((job: { id: string }) => job.id === bypassId));

  const illegalJump = await fetch(`${BASE}/api/jobs/${encodeURIComponent(jobId)}/transition`, {
    method: 'POST',
    headers: auth(a),
    body: JSON.stringify({ state: 'COMPLETED' }),
  });
  check('cannot jump REQUESTED directly to COMPLETED', illegalJump.status === 409, `got ${illegalJump.status}`);

  for (const state of ['QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'SETTLED']) {
    const response = await fetch(`${BASE}/api/jobs/${encodeURIComponent(jobId)}/transition`, {
      method: 'POST',
      headers: auth(a),
      body: JSON.stringify({ state }),
    });
    const body = await response.json();
    check(`accepts legal transition to ${state}`,
      response.status === 200 && body.job?.status === state,
      `got ${response.status} ${JSON.stringify(body).slice(0, 120)}`);
  }

  // The passport headline must use the same server-owned evidence as the
  // trust rubric. Editable/seeded profile counters once showed "248 jobs" and
  // "4.9" beside a score computed from the real one-job/no-review history.
  const passportResponse = await fetch(`${BASE}/api/passport/me`, { headers: auth(a) });
  const passportBody = await passportResponse.json();
  check('passport job count is derived from completed jobs',
    passportResponse.status === 200 && passportBody.profile?.totalJobsCount === 1,
    JSON.stringify(passportBody.profile));
  check('passport rating is derived from reviews',
    passportBody.profile?.rating === 0,
    JSON.stringify(passportBody.profile));

  const passportHandle = passportBody.profile?.passportHandle;
  const publicPassport = await fetch(`${BASE}/p/${encodeURIComponent(passportHandle)}`);
  const publicPassportHtml = await publicPassport.text();
  check('public passport renders the derived evidence counters',
    publicPassport.status === 200
      && /Jobs Done<\/span><span class="v v-g">1<\/span>/.test(publicPassportHtml)
      && /Rating<\/span><span class="v v-a">&#9733; —<\/span>/.test(publicPassportHtml),
    `got ${publicPassport.status}`);

  const reviewLinkResponse = await fetch(`${BASE}/api/reviews/link`, {
    method: 'POST',
    headers: auth(a),
    body: JSON.stringify({ jobId }),
  });
  const reviewLinkBody = await reviewLinkResponse.json();
  const reviewToken = reviewLinkBody.url
    ? new URL(reviewLinkBody.url).pathname.split('/').filter(Boolean).pop()
    : undefined;
  check('owner can create a customer review link',
    reviewLinkResponse.status === 201 && Boolean(reviewToken),
    JSON.stringify(reviewLinkBody));

  const reviewResponse = await fetch(`${BASE}/api/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: reviewToken,
      ratings: { workmanship: 5, punctuality: 5, priceHonesty: 5, cleanliness: 5 },
      text: 'Regression review evidence',
    }),
  });
  check('customer review is accepted without a customer account',
    reviewResponse.status === 201,
    `got ${reviewResponse.status}`);

  const reviewedPassport = await (
    await fetch(`${BASE}/api/passport/me`, { headers: auth(a) })
  ).json();
  check('submitted review updates the derived passport rating',
    reviewedPassport.profile?.rating === 5,
    JSON.stringify(reviewedPassport.profile));

  const reviewedPublicHtml = await (
    await fetch(`${BASE}/p/${encodeURIComponent(passportHandle)}?after-review=1`)
  ).text();
  check('public passport updates its headline and review evidence',
    /Rating<\/span><span class="v v-a">&#9733; 5\.0<\/span>/.test(reviewedPublicHtml)
      && /1 review<\/div>/.test(reviewedPublicHtml),
    'expected a 5.0 headline and one review');

  const entryId = `01a05000-0000-7000-8000-${stamp}0002`;
  const mkEntry = (d: string) => JSON.stringify({
    id: entryId, direction: 'in', amount: 100, description: d,
    paymentType: 'cash', date: new Date().toISOString().slice(0, 10),
  });
  await fetch(`${BASE}/api/ledger/entries`, { method: 'POST', headers: auth(a), body: mkEntry('a') });
  const bEntry = await fetch(`${BASE}/api/ledger/entries`, { method: 'POST', headers: auth(b), body: mkEntry('b') });
  check('ledger collision is 409, not 500', bEntry.status === 409, `got ${bEntry.status}`);

  // ---------------------------------------------------------------------
  // Ledger truthfulness. The UI and income statement depend on these
  // algebraic values: outgoing rows reduce net income, and an append-only
  // reversal cancels both owed and outstanding without editing history.
  // ---------------------------------------------------------------------
  console.log('\nledger summary and reversal');

  const outgoingId = `01a05000-0000-7000-8000-${stamp}0004`;
  const outgoing = await fetch(`${BASE}/api/ledger/entries`, {
    method: 'POST',
    headers: auth(a),
    body: JSON.stringify({
      id: outgoingId,
      direction: 'out',
      amount: 80,
      description: 'Outstanding material amount',
      paymentType: 'upi',
      date: new Date().toISOString().slice(0, 10),
    }),
  });
  check('outgoing ledger entry is created', outgoing.status === 201, `got ${outgoing.status}`);

  const beforeReversal = await (
    await fetch(`${BASE}/api/ledger/summary?period=all`, { headers: auth(a) })
  ).json();
  check('summary subtracts outgoing from net',
    beforeReversal.earned === 100
      && beforeReversal.owed === 80
      && beforeReversal.net === 20,
    JSON.stringify(beforeReversal));
  check('unsettled outgoing amount is outstanding',
    beforeReversal.outstanding === 80,
    JSON.stringify(beforeReversal));
  check('payment split counts received income only',
    beforeReversal.byPaymentType?.cash === 100
      && beforeReversal.byPaymentType?.upi === 0,
    JSON.stringify(beforeReversal.byPaymentType));

  const reversal = await fetch(
    `${BASE}/api/ledger/entries/${encodeURIComponent(outgoingId)}/reverse`,
    {
      method: 'POST',
      headers: auth(a),
      body: JSON.stringify({ reason: 'Regression cancellation' }),
    }
  );
  check('outgoing entry can be reversed append-only', reversal.status === 201, `got ${reversal.status}`);

  const afterReversal = await (
    await fetch(`${BASE}/api/ledger/summary?period=all`, { headers: auth(a) })
  ).json();
  check('reversal cancels owed, net and outstanding correctly',
    afterReversal.earned === 100
      && afterReversal.owed === 0
      && afterReversal.net === 100
      && afterReversal.outstanding === 0,
    JSON.stringify(afterReversal));

  // ---------------------------------------------------------------------
  // Retry classification. A permanent failure reported as retryable is an
  // outbox that retries forever and a failed badge that never clears.
  // ---------------------------------------------------------------------
  console.log('\nsync retry classification');

  const batch = await fetch(`${BASE}/api/sync/batch`, {
    method: 'POST',
    headers: auth(b),
    body: JSON.stringify({
      items: [
        { kind: 'job', payload: { id: jobId, title: 'B job', amount: 100 } },        // conflict -> permanent
        { kind: 'ledger_entry', payload: { direction: 'in', amount: -5, description: 'bad', paymentType: 'cash', date: '2026-08-29' } }, // invalid -> permanent
        { kind: 'nonsense', payload: {} },                                            // unknown -> permanent
      ],
    }),
  });
  const batchBody = await batch.json();
  const byIndex = (i: number) => batchBody.results?.find((r: { index: number }) => r.index === i);

  check('conflicting item is permanent', byIndex(0)?.retryable === false && byIndex(0)?.syncState === 'failed',
    JSON.stringify(byIndex(0)));
  check('invalid item is permanent', byIndex(1)?.retryable === false && byIndex(1)?.syncState === 'failed',
    JSON.stringify(byIndex(1)));
  check('unknown kind is permanent', byIndex(2)?.retryable === false, JSON.stringify(byIndex(2)));
  check('batch reports permanentlyFailed', batchBody.permanentlyFailed === 3,
    `got ${batchBody.permanentlyFailed}`);

  // ---------------------------------------------------------------------
  // Assistant endpoint hardening.
  // ---------------------------------------------------------------------
  console.log('\nassistant endpoint');

  const noAuth = await fetch(`${BASE}/api/assistant/process`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userInput: 'hello' }),
  });
  check('requires a bearer token', noAuth.status === 401, `got ${noAuth.status}`);

  const tooLong = await fetch(`${BASE}/api/assistant/process`, {
    method: 'POST', headers: auth(a),
    body: JSON.stringify({ userInput: 'x'.repeat(50_000) }),
  });
  check('rejects oversized input', tooLong.status === 400, `got ${tooLong.status}`);

  const badType = await fetch(`${BASE}/api/assistant/process`, {
    method: 'POST', headers: auth(a), body: JSON.stringify({ userInput: { $ne: 1 } }),
  });
  check('rejects non-string input', badType.status === 400, `got ${badType.status}`);

  // ---------------------------------------------------------------------
  // Query-parameter coercion. Operator injection must read as a missing
  // parameter, never reach a filter.
  // ---------------------------------------------------------------------
  console.log('\nquery-parameter coercion');

  const inj = await fetch(`${BASE}/api/pricing/band?${new URLSearchParams({ 'trade[$ne]': 'x', taskCode: 'fan_install' })}`,
    { headers: auth(a) });
  check('operator syntax does not reach the filter', inj.status === 400 || inj.status === 404, `got ${inj.status}`);

  // ---------------------------------------------------------------------
  // Health must not leak driver detail.
  // ---------------------------------------------------------------------
  console.log('\nhealth disclosure');

  const health = await (await fetch(`${BASE}/api/health`)).json();
  const err = health?.db?.error;
  check('db error is a category or null',
    err === null || ['unreachable', 'auth', 'timeout', 'unknown'].includes(err),
    `got ${JSON.stringify(err)}`);

  // ---------------------------------------------------------------------
  // Demo OTP bypass. Two properties, both load-bearing: it is OFF unless
  // explicitly enabled, and when on it touches exactly one number.
  //
  // Asserted in-process rather than over HTTP because both require controlling
  // the server's environment, and the suite runs against an already-started
  // server whose env it cannot change. resolveDemoOtp() reads process.env on
  // every call precisely so this is testable.
  // ---------------------------------------------------------------------
  console.log('\ndemo OTP bypass');

  const savedEnv = {
    enabled: process.env.DEMO_OTP_ENABLED,
    phone: process.env.DEMO_OTP_PHONE,
    code: process.env.DEMO_OTP_CODE,
  };

  try {
    // -- off by default --------------------------------------------------
    delete process.env.DEMO_OTP_ENABLED;
    delete process.env.DEMO_OTP_PHONE;
    delete process.env.DEMO_OTP_CODE;

    check('off when no env is set', resolveDemoOtp() === null);
    check('accepts nothing when off', demoOtpAccepts('+919876543210', '000000') === false);

    // Config present but not switched on: still off. Enabling must be explicit,
    // never a side effect of having set the other two.
    process.env.DEMO_OTP_PHONE = '+919876543210';
    process.env.DEMO_OTP_CODE = '424242';
    check('off until DEMO_OTP_ENABLED is true', resolveDemoOtp() === null);
    check('accepts nothing while unenabled', demoOtpAccepts('+919876543210', '424242') === false);

    // Enabled but malformed: unparseable means off, not partially on.
    process.env.DEMO_OTP_ENABLED = 'true';
    process.env.DEMO_OTP_CODE = 'abc';
    check('off when the code is unparseable', resolveDemoOtp() === null);
    process.env.DEMO_OTP_CODE = '424242';
    process.env.DEMO_OTP_PHONE = 'not-a-phone';
    check('off when the phone is unparseable', resolveDemoOtp() === null);

    // -- scoped to exactly one number ------------------------------------
    process.env.DEMO_OTP_PHONE = '+919876543210';
    check('on when fully configured', resolveDemoOtp() !== null);
    check('accepts the demo number with the fixed code',
      demoOtpAccepts('+919876543210', '424242') === true);

    check('a DIFFERENT number is unaffected by the same code',
      demoOtpAccepts('+919000000123', '424242') === false);
    check('the demo number still rejects a wrong code',
      demoOtpAccepts('+919876543210', '111111') === false);
    check('no length-prefix match',
      demoOtpAccepts('+919876543210', '4242') === false);
  } finally {
    for (const [k, v] of Object.entries({
      DEMO_OTP_ENABLED: savedEnv.enabled,
      DEMO_OTP_PHONE: savedEnv.phone,
      DEMO_OTP_CODE: savedEnv.code,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nregression run failed to complete:', err.message, '\n');
  process.exit(1);
});
