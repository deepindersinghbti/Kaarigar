/**
 * Mint a long-lived token for the seeded demo worker.
 *
 * Owner: Track A. Run with:  npm run demo:token
 *
 * WHY THIS EXISTS. /api/assistant/process now requires a bearer token, because
 * every successful assistant interaction ends in an owner-scoped write - a
 * KamaiEntry needs profileId, a JobItem needs kaarigarId - so there is no
 * coherent unauthenticated version of the flow.
 *
 * But the demo walkthrough is "open app, tap mic", and Track B has not built
 * login yet. Requiring auth with no way to obtain a token would break the only
 * two working demo beats. The fix is a seeded demo account whose token ships in
 * the demo build - NOT leaving the endpoint open.
 *
 * This is a rehearsed-demo affordance and nothing else:
 *   - It requires repo and database access to run. It is not an endpoint.
 *   - The token authenticates ONE seeded account holding only seed data.
 *   - Track B puts the value in VITE_DEMO_TOKEN for the demo build.
 *   - DELETE the variable once login exists. Day 9 should confirm it is gone.
 *
 * A 12-hour default outlives a demo day without outliving the event.
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectDb, getDb, closeDb } from '../src/server/db';
import { signAccessToken, signRefreshToken } from '../src/server/auth/tokens';
import type { AuthUser, Role } from '../src/types';

const TTL_SECONDS = Number(process.env.DEMO_TOKEN_TTL_SECONDS) || 12 * 60 * 60;
const DEMO_PHONE = '+919876543210';

async function main() {
  const db = await connectDb();
  if (!db) {
    console.error('\n[demo:token] No database connection. Check MONGODB_URI and the Atlas allowlist.\n');
    process.exit(1);
  }

  const record = await getDb().collection('users').findOne({ phone: DEMO_PHONE });
  if (!record) {
    console.error(`\n[demo:token] No seeded user for ${DEMO_PHONE}. Run: npm run seed\n`);
    await closeDb();
    process.exit(1);
  }

  const user: AuthUser = {
    uid: String(record._id),
    phone: record.phone as string,
    roles: record.roles as Role[],
  };

  const access = signAccessToken(user, TTL_SECONDS);
  const refresh = signRefreshToken(user.uid);
  await getDb().collection('users').updateOne(
    { _id: user.uid as never },
    { $set: { refreshJti: refresh.jti, refreshFamily: refresh.family, refreshRevoked: false } }
  );

  const hours = Math.round(TTL_SECONDS / 3600);
  console.log('\n[demo:token] Demo access token');
  console.log(`[demo:token]   account : ${user.phone}  (uid ${user.uid})`);
  console.log(`[demo:token]   roles   : ${user.roles.join(', ')}`);
  console.log(`[demo:token]   expires : in ${hours}h`);
  console.log('[demo:token]');
  console.log('[demo:token] Track B: put this in .env for the demo build, and send it as');
  console.log('[demo:token] Authorization: Bearer <token> on the assistant fetch.');
  console.log('[demo:token]');
  console.log(`VITE_DEMO_TOKEN="${access}"`);
  console.log('');
  console.log('[demo:token] REMOVE VITE_DEMO_TOKEN once login exists. It is a real');
  console.log('[demo:token] credential for the demo account, and it ships in the browser');
  console.log('[demo:token] bundle - anyone who opens devtools on the demo build has it.\n');

  await closeDb();
}

main().catch(async (err) => {
  console.error('[demo:token] failed:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
