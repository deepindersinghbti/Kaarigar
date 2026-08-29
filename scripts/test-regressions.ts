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

  const entryId = `01a05000-0000-7000-8000-${stamp}0002`;
  const mkEntry = (d: string) => JSON.stringify({
    id: entryId, direction: 'in', amount: 100, description: d,
    paymentType: 'cash', date: new Date().toISOString().slice(0, 10),
  });
  await fetch(`${BASE}/api/ledger/entries`, { method: 'POST', headers: auth(a), body: mkEntry('a') });
  const bEntry = await fetch(`${BASE}/api/ledger/entries`, { method: 'POST', headers: auth(b), body: mkEntry('b') });
  check('ledger collision is 409, not 500', bEntry.status === 409, `got ${bEntry.status}`);

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

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nregression run failed to complete:', err.message, '\n');
  process.exit(1);
});
