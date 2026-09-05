/**
 * Seed the demo worker, jobs and ledger entries into MongoDB.
 *
 * Owner: Track A. Run with:  npm run seed
 *
 * Reuses INITIAL_PROFILE / INITIAL_JOBS / INITIAL_KAMAI from
 * src/data/initialData.ts rather than restating them, so the seeded database
 * and the app's local fixtures cannot drift apart. That matters on Day 6, when
 * screens are being switched between localStorage and the API one at a time via
 * USE_API - if the two sources disagreed, a screen would visibly change content
 * when the flag flipped, and it would look like a sync bug.
 *
 * Idempotent: re-running replaces the demo rows and leaves everything else
 * alone. Pass --reset to drop the collections first.
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectDb, getDb, closeDb } from '../src/server/db';
import { INITIAL_PROFILE, INITIAL_JOBS, INITIAL_KAMAI } from '../src/data/initialData';

const DEMO_PHONE = '+919876543210';
const DEMO_UID = 'usr-demo-ramesh';

async function main() {
  const reset = process.argv.includes('--reset');

  const db = await connectDb();
  if (!db) {
    console.error('\n[seed] No database connection. Check MONGODB_URI and the Atlas allowlist.\n');
    process.exit(1);
  }

  if (reset) {
    for (const c of ['users', 'kaarigar_profiles', 'jobs', 'ledger_entries']) {
      await db.collection(c).drop().catch(() => { /* absent is fine */ });
    }
    console.log('[seed] dropped users, kaarigar_profiles, jobs, ledger_entries');
  }

  const now = new Date();

  // The demo worker. upsert so re-running does not duplicate, and so a real
  // OTP login with this number lands on the same account rather than creating
  // a second one.
  await db.collection('users').updateOne(
    { _id: DEMO_UID as never },
    {
      $set: { phone: DEMO_PHONE, roles: ['kaarigar'], lastLoginAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  const { id: profileId, ...profileRest } = INITIAL_PROFILE;
  await db.collection('kaarigar_profiles').updateOne(
    { _id: profileId as never },
    { $set: { ...profileRest, userId: DEMO_UID, updatedAt: now } },
    { upsert: true }
  );

  for (const job of INITIAL_JOBS) {
    const { id, ...rest } = job;
    await db.collection('jobs').updateOne(
      { _id: id as never },
      {
        $set: {
          ...rest,
          // Authenticated job reads and transitions are owner-scoped by user id,
          // not passport/profile id. Keep the demo rows visible to the account
          // created above and usable by the same lifecycle endpoints.
          kaarigarId: DEMO_UID,
          // Seed rows are on the server by definition.
          syncState: 'synced',
          // initialData ships an empty history; give it one entry that matches
          // the row's actual status so stateHistory is never a lie.
          stateHistory: rest.stateHistory.length
            ? rest.stateHistory
            : [{ state: rest.status, at: `${rest.date}T00:00:00.000Z`, by: DEMO_UID }],
        },
      },
      { upsert: true }
    );
  }

  for (const entry of INITIAL_KAMAI) {
    const { id, ...rest } = entry;
    await db.collection('ledger_entries').updateOne(
      { _id: id as never },
      { $set: { ...rest, profileId, syncState: 'synced' } },
      { upsert: true }
    );
  }

  const counts = {
    users: await db.collection('users').countDocuments(),
    kaarigar_profiles: await db.collection('kaarigar_profiles').countDocuments(),
    jobs: await db.collection('jobs').countDocuments(),
    ledger_entries: await db.collection('ledger_entries').countDocuments(),
  };

  console.log('\n[seed] done');
  console.log(`[seed]   demo worker : ${INITIAL_PROFILE.name} (${DEMO_PHONE})`);
  console.log(`[seed]   handle      : ${INITIAL_PROFILE.passportHandle}`);
  console.log('[seed]   collections :', counts, '\n');

  await closeDb();
}

main().catch(async (err) => {
  console.error('[seed] failed:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
