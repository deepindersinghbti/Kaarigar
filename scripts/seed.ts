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
import type { WorkerProfile } from '../src/types';

const DEMO_PHONE = '+919876543210';
const DEMO_UID = 'usr-demo-ramesh';

/**
 * The demo customer account, for the customer-side browse/request flow.
 *
 * A users doc and nothing else: a customer has no passport, no ledger and no
 * jobs of their own until they request one, so seeding anything further would
 * be inventing state that the flow itself is supposed to create.
 *
 * The number is the demo handset, in the same E.164 form as DEMO_PHONE above.
 * Login is by OTP on it, so changing it here without re-seeding leaves the
 * account unreachable from the phone in the room.
 *
 * Ends in ...670, not ...678, deliberately. INITIAL_JOBS[0] carries
 * customerPhone '+91 98123 45678' - the same digits - and a demo customer whose
 * number matches the customer on Ramesh's job history reads as a bug on stage.
 * Moving this constant is one character; editing the fixture would touch a file
 * three tracks share.
 */
const DEMO_CUSTOMER_PHONE = '+919812345670';
const DEMO_CUSTOMER_UID = 'usr-demo-customer';

/**
 * Five more passports, so the customer browse list is a list rather than a
 * single row.
 *
 * Profile-only by design: nobody logs in as these five, so a users doc for each
 * would be five accounts that can never be authenticated - state that exists
 * only to look plausible in a database dump.
 *
 * They still carry a `userId`, because a job's `kaarigarId` is a USER id
 * everywhere in this codebase (see the jobs upsert below), never a profile id.
 * Without one, a job requested against these five would be owned by nobody and
 * invisible to every owner-scoped query. The ids are fixed, not generated, so
 * re-seeding cannot reparent jobs that already point at them.
 *
 * `phone`, `totalEarnings`, `dailyRate` and `bloodGroup` are populated on
 * purpose. The public projection is supposed to strip those four; a field left
 * empty in the database proves nothing about whether the projection works.
 */
const EXTRA_KAARIGARS: WorkerProfile[] = [
  {
    id: 'krg-2026-8843',
    userId: 'usr-demo-sukhwinder',
    passportHandle: 'sukhwinder-singh-chd',
    name: 'Sukhwinder Singh',
    trade: 'Plumber',
    experienceYears: 12,
    location: 'Sector 22-B, Chandigarh',
    phone: '+91 98150 22114',
    skills: ['Tap & Mixer Fitting', 'Bathroom Fittings', 'Leak Detection', 'Water Tank & Motor Repair'],
    certifications: ['ITI Plumber National Trade Certificate (NTC)'],
    rating: 4.7,
    totalJobsCount: 164,
    totalEarnings: 246000,
    verifiedStatus: 'unverified',
    joinedDate: 'June 2024',
    bloodGroup: 'B+',
    dailyRate: 1000,
    bio: '12 saal ka anubhav bathroom fitting, leakage repair aur water motor installation mein.',
  },
  {
    id: 'krg-2026-8844',
    userId: 'usr-demo-harpreet',
    passportHandle: 'harpreet-singh-mohali',
    name: 'Harpreet Singh',
    trade: 'Carpenter',
    experienceYears: 9,
    location: 'Phase 5, Mohali',
    phone: '+91 97790 44236',
    skills: ['Modular Kitchen', 'Wardrobe & Almirah', 'Door & Window Frames', 'Furniture Repair'],
    certifications: ['ITI Carpenter National Trade Certificate (NTC)'],
    rating: 4.6,
    totalJobsCount: 118,
    totalEarnings: 198500,
    verifiedStatus: 'unverified',
    joinedDate: 'January 2025',
    bloodGroup: 'O+',
    dailyRate: 1100,
    bio: 'Modular kitchen, wardrobe aur custom furniture ka kaam, 9 saal se.',
  },
  {
    id: 'krg-2026-8845',
    userId: 'usr-demo-manjeet',
    passportHandle: 'manjeet-kaur-chd',
    name: 'Manjeet Kaur',
    trade: 'Painter',
    experienceYears: 7,
    location: 'Sector 15-C, Chandigarh',
    phone: '+91 98728 61140',
    skills: ['Interior Emulsion', 'Exterior Weather Coat', 'Putty & Surface Prep', 'Texture & Stencil Work'],
    certifications: ['Pradhan Mantri Kaushal Vikas Yojana (PMKVY) Level 3'],
    rating: 4.8,
    totalJobsCount: 96,
    totalEarnings: 141200,
    verifiedStatus: 'unverified',
    joinedDate: 'August 2024',
    bloodGroup: 'A+',
    dailyRate: 900,
    bio: 'Ghar ki interior aur exterior painting, putty se lekar final coat tak.',
  },
  {
    id: 'krg-2026-8846',
    userId: 'usr-demo-vikram',
    passportHandle: 'vikram-thakur-zirakpur',
    name: 'Vikram Thakur',
    trade: 'Mason',
    experienceYears: 15,
    location: 'Dhakoli, Zirakpur',
    phone: '+91 94636 30918',
    skills: ['Brickwork & Plaster', 'Tile & Marble Laying', 'RCC Slab Work', 'Waterproofing'],
    certifications: ['ITI Mason (Building Constructor) National Trade Certificate (NTC)'],
    rating: 4.5,
    totalJobsCount: 203,
    totalEarnings: 312400,
    verifiedStatus: 'unverified',
    joinedDate: 'March 2024',
    bloodGroup: 'B-',
    dailyRate: 1050,
    bio: '15 saal se plaster, tile laying aur waterproofing ka kaam Zirakpur aur Mohali mein.',
  },
  {
    id: 'krg-2026-8847',
    userId: 'usr-demo-anil',
    passportHandle: 'anil-kumar-panchkula',
    name: 'Anil Kumar',
    trade: 'AC & Appliance Technician',
    experienceYears: 10,
    location: 'Sector 20, Panchkula',
    phone: '+91 99883 57042',
    skills: ['Split AC Installation', 'Gas Refilling', 'Washing Machine Repair', 'Refrigerator Servicing'],
    certifications: ['ITI Refrigeration & Air Conditioning Technician (NTC)'],
    rating: 4.4,
    totalJobsCount: 187,
    totalEarnings: 268900,
    verifiedStatus: 'unverified',
    joinedDate: 'November 2024',
    bloodGroup: 'AB+',
    dailyRate: 1150,
    bio: 'Split AC installation, gas refilling aur home appliance repair ka 10 saal ka tajurba.',
  },
];

/**
 * Upsert one demo account and return the uid it actually has.
 *
 * KEYED ON PHONE, NOT _id, AND THAT IS THE WHOLE POINT. OTP verify resolves
 * identity with findOne({ phone }) and reuses that document's _id
 * (src/server/routes/identity.ts). A seed keyed on _id disagrees with that: if
 * anyone has already logged in with this number, their account holds the phone
 * under a generated uid, and inserting a second document with the same phone
 * violates the unique index on users.phone - the seed dies with E11000 and the
 * database cannot be seeded at all. Keyed on phone, that same situation is a
 * no-op update of the account login will actually return.
 *
 * The literal uid survives as $setOnInsert, so a clean database still gets the
 * deterministic ids check:demo-seed asserts on.
 *
 * Returns the resolved uid rather than the literal, because callers must write
 * THAT into ownership fields. Writing the literal into a job's kaarigarId while
 * the account is reachable under a different uid is precisely the split that
 * made /p/ramesh-kumar-chd unreachable on the deploy: rows owned by an id
 * nobody can authenticate as. An adoption is announced, never silent - a demo
 * that runs on a uid nobody expected should say so before the demo, not during.
 */
async function upsertDemoAccount(
  phone: string,
  preferredUid: string,
  role: 'kaarigar' | 'customer',
  now: Date
): Promise<string> {
  const db = getDb();
  await db.collection('users').updateOne(
    { phone },
    {
      $set: { roles: [role], lastLoginAt: now },
      $setOnInsert: { _id: preferredUid as never, createdAt: now },
    },
    { upsert: true }
  );

  const uid = String(
    (await db.collection('users').findOne({ phone }, { projection: { _id: 1 } }))!._id
  );
  if (uid !== preferredUid) {
    console.log(`[seed]   NOTE: adopted existing account ${uid} for ${phone} (expected ${preferredUid})`);
  }
  return uid;
}

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

  const workerUid = await upsertDemoAccount(DEMO_PHONE, DEMO_UID, 'kaarigar', now);
  await upsertDemoAccount(DEMO_CUSTOMER_PHONE, DEMO_CUSTOMER_UID, 'customer', now);

  const { id: profileId, ...profileRest } = INITIAL_PROFILE;
  await db.collection('kaarigar_profiles').updateOne(
    { _id: profileId as never },
    { $set: { ...profileRest, userId: workerUid, updatedAt: now } },
    { upsert: true }
  );

  // GET /api/passport/me and getProfileIdForUser both do an unsorted
  // findOne({ userId }), so a second passport on this account is not a
  // duplicate row, it is a coin flip over which passport the worker sees.
  // A login before a seed creates exactly that (an auto-stub named "Kaarigar"),
  // so say so loudly rather than let the seed report success over it.
  const strays = await db
    .collection('kaarigar_profiles')
    .find({ userId: workerUid, _id: { $ne: profileId as never } }, { projection: { passportHandle: 1 } })
    .toArray();
  for (const stray of strays) {
    console.warn(
      `[seed]   WARNING: ${workerUid} has a second passport /p/${String(stray.passportHandle)} ` +
      `(_id ${String(stray._id)}). Which one GET /api/passport/me returns is undefined. Remove one.`
    );
  }

  // The other five passports, so the browse list has something to browse.
  // $set on a fixed _id, exactly like the demo worker above: re-running
  // rewrites these five rows and touches nothing else.
  for (const kaarigar of EXTRA_KAARIGARS) {
    const { id, ...rest } = kaarigar;
    await db.collection('kaarigar_profiles').updateOne(
      { _id: id as never },
      { $set: { ...rest, updatedAt: now } },
      { upsert: true }
    );
  }

  for (const job of INITIAL_JOBS) {
    const { id, ...rest } = job;
    await db.collection('jobs').updateOne(
      { _id: id as never },
      {
        $set: {
          ...rest,
          // Authenticated job reads and transitions are owner-scoped by user id,
          // not passport/profile id. Keep the demo rows visible to the account
          // resolved above and usable by the same lifecycle endpoints.
          kaarigarId: workerUid,
          // Seed rows are on the server by definition.
          syncState: 'synced',
          // initialData ships an empty history; give it one entry that matches
          // the row's actual status so stateHistory is never a lie.
          stateHistory: rest.stateHistory.length
            ? rest.stateHistory
            : [{ state: rest.status, at: `${rest.date}T00:00:00.000Z`, by: workerUid }],
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
  console.log(`[seed]   demo buyer  : customer (${DEMO_CUSTOMER_PHONE})`);
  for (const k of EXTRA_KAARIGARS) {
    console.log(`[seed]   also        : ${k.name.padEnd(18)} ${k.trade.padEnd(26)} /p/${k.passportHandle}`);
  }
  console.log('[seed]   collections :', counts, '\n');

  await closeDb();
}

main().catch(async (err) => {
  console.error('[seed] failed:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
