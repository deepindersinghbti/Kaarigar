/**
 * Is the pricing engine demo-ready?
 *
 * Owner: Track A. Run with:  npm run check:rates
 *
 * Answers one question with an exit code: does any band in the database still
 * present itself as an unsourced placeholder? Section 14.1 treats an unsourced
 * figure offered as authoritative as a panel-losing claim, so "are we ready on
 * pricing" should be answerable by running something rather than by reading a
 * file and hoping.
 *
 * Reads the DATABASE, not the CSV. The CSV is intent; the database is what the
 * API will actually serve, and those diverge the moment someone forgets to
 * re-seed.
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectDb, getDb, closeDb } from '../src/server/db';
// Imported from the data module, NOT from the seeder: importing the seeder
// executes its main() and would run a seed as a side effect of this check.
import { RATE_BANDS, UNSOURCED_LABEL } from '../src/server/data/rateBands';

async function main() {
  const db = await connectDb();
  if (!db) {
    console.error('\n[check:rates] No database connection.\n');
    process.exit(1);
  }

  const bands = await getDb().collection(RATE_BANDS).find({}).toArray();

  /**
   * An EMPTY citation counts as unsourced, not as sourced.
   *
   * The first version of this check compared only against UNSOURCED_LABEL, so a
   * band with seededFrom: "" passed as sourced - which is the worst case of the
   * three, because it carries neither a source nor the placeholder warning that
   * would tell a reader to distrust it. Testing found exactly such a row in the
   * database. Absence of the placeholder is not evidence of a citation.
   */
  const citationOf = (b: unknown): string => {
    const v = (b as { seededFrom?: unknown })?.seededFrom;
    return typeof v === 'string' ? v.trim() : '';
  };
  const isUnsourced = (b: unknown) => {
    const c = citationOf(b);
    return c === '' || c === UNSOURCED_LABEL;
  };

  const unsourced = bands.filter((b) => isUnsourced(b));
  const sourced = bands.length - unsourced.length;

  console.log(`\n[check:rates] ${bands.length} bands in the database`);
  console.log(`[check:rates] sourced   : ${sourced}`);
  console.log(`[check:rates] unsourced : ${unsourced.length}`);

  if (unsourced.length > 0) {
    console.log('');
    for (const b of unsourced.slice(0, 8)) {
      const why = citationOf(b) === '' ? 'NO CITATION AT ALL' : 'placeholder';
      console.log(`  UNSOURCED  ${b.trade}/${b.taskCode}  (${why})`);
    }
    if (unsourced.length > 8) console.log(`  ... and ${unsourced.length - 8} more`);
    console.log('\n[check:rates] NOT DEMO-READY. Every band above is served with');
    console.log(`[check:rates]   seededFrom = "${UNSOURCED_LABEL}"`);
    console.log('[check:rates] which is honest, but it is not a sourced rate. Put real');
    console.log('[check:rates] citations in data/rate-bands.csv and re-seed.\n');
    await closeDb();
    process.exit(1);
  }

  // A citation exists, but nobody has checked it is a real one. Say so.
  console.log('\n[check:rates] Every band carries a citation. Spot-check a few by hand —');
  console.log('[check:rates] this checks that a citation is PRESENT, not that it is TRUE.\n');
  await closeDb();
}

main().catch(async (err) => {
  console.error('\n[check:rates] failed:', err.message, '\n');
  await closeDb().catch(() => {});
  process.exit(1);
});
