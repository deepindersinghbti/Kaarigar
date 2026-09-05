/**
 * Read-only verification for the deterministic demo seed.
 *
 * Run after `npm run seed`. This never creates, updates, or deletes data; it
 * proves the account, passport, job ownership, and ledger ownership agree.
 */

import dotenv from 'dotenv';
dotenv.config();

import { closeDb, connectDb } from '../src/server/db';
import { INITIAL_JOBS, INITIAL_KAMAI, INITIAL_PROFILE } from '../src/data/initialData';

const DEMO_PHONE = '+919876543210';
const DEMO_UID = 'usr-demo-ramesh';

let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`);
    return;
  }
  failed++;
  console.error(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
}

async function main() {
  const db = await connectDb();
  if (!db) throw new Error('No database connection. Point MONGODB_URI at the disposable demo database.');

  console.log('\nDemo seed ownership\n');

  const user = await db.collection('users').findOne({ _id: DEMO_UID as never });
  check('demo account exists', Boolean(user));
  check('demo account phone matches', user?.phone === DEMO_PHONE);

  const profile = await db.collection('kaarigar_profiles').findOne({ _id: INITIAL_PROFILE.id as never });
  check('demo passport exists', Boolean(profile));
  check('passport belongs to demo account', profile?.userId === DEMO_UID, `got ${String(profile?.userId)}`);

  for (const fixture of INITIAL_JOBS) {
    const job = await db.collection('jobs').findOne({ _id: fixture.id as never });
    check(`job ${fixture.id} exists`, Boolean(job));
    check(`job ${fixture.id} belongs to demo account`,
      job?.kaarigarId === DEMO_UID,
      `got ${String(job?.kaarigarId)}`);
  }

  for (const fixture of INITIAL_KAMAI) {
    const entry = await db.collection('ledger_entries').findOne({ _id: fixture.id as never });
    check(`ledger entry ${fixture.id} exists`, Boolean(entry));
    check(`ledger entry ${fixture.id} belongs to demo passport`,
      entry?.profileId === INITIAL_PROFILE.id,
      `got ${String(entry?.profileId)}`);
  }

  console.log(`\n${failed === 0 ? 'Demo seed verified.' : `${failed} demo seed checks failed.`}\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('\n[check:demo-seed] failed:', error.message, '\n');
  await closeDb().catch(() => {});
  process.exit(1);
});
