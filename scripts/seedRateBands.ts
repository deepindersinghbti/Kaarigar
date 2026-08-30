/**
 * Seed the rate_bands collection from data/rate-bands.csv.
 *
 * Owner: Track A. Run with:  npm run seed:rates
 *
 * ============================================================================
 * THE RATES ARE DATA, NOT CODE, AND EVERY ROW CARRIES A CITATION.
 *
 * They used to be a TypeScript array with one shared placeholder string. That
 * made replacing them a code change, and made "which bands are sourced?" a
 * question you answered by reading a file rather than by running something.
 *
 * Now: one row, one band, one `source` column. A row still carrying the
 * UNSOURCED sentinel is REFUSED unless --allow-unsourced is passed, so an
 * unsourced band reaches the database only as a deliberate, visible act.
 *
 * `npm run check:rates` reports what is in the database and exits non-zero if
 * anything is unsourced, so the pre-demo question is answerable by a command.
 *
 * WHY THIS RATHER THAN JUST FILLING IN NUMBERS. Section 14.1: claiming a source
 * you do not have is the fastest way to lose a panel. A plausible number under
 * a fabricated "CPWD DSR 2024" citation is worse than an obvious placeholder,
 * because the placeholder announces itself and the fabrication does not. The
 * mechanism below makes the honest path the default one.
 * ============================================================================
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { connectDb, getDb, closeDb } from '../src/server/db';
import { RATE_BANDS, UNSOURCED_LABEL, UNSOURCED_SENTINEL } from '../src/server/data/rateBands';
import type { RateBand } from '../src/types';

interface Row {
  trade: string;
  taskCode: string;
  unit: string;
  p25: number;
  p50: number;
  p75: number;
  wageFloor: number;
  source: string;
  line: number;
}

/**
 * Minimal CSV reader: strips `#` comments and blank lines, splits on commas.
 *
 * Deliberately not a CSV library. The file is ours, the format is fixed, and
 * the citation column is the only free text - which is why quoting is handled
 * by forbidding commas in it rather than by parsing quotes. A citation that
 * needs a comma should use a semicolon; that is a smaller cost than a
 * dependency and a parser nobody reads.
 */
function parseCsv(text: string): Row[] {
  const lines = text
    .split(/\r?\n/)
    .map((l, i) => ({ raw: l.trim(), line: i + 1 }))
    .filter(({ raw }) => raw && !raw.startsWith('#'));

  const header = lines.shift();
  if (!header || !header.raw.startsWith('trade,')) {
    throw new Error('rate-bands.csv: header row not found');
  }

  return lines.map(({ raw, line }) => {
    const c = raw.split(',').map((s) => s.trim());
    if (c.length !== 8) {
      throw new Error(`rate-bands.csv:${line}: expected 8 columns, found ${c.length} — a citation containing a comma will do this; use a semicolon`);
    }
    const [trade, taskCode, unit, p25, p50, p75, wageFloor, source] = c;
    const nums = { p25: Number(p25), p50: Number(p50), p75: Number(p75), wageFloor: Number(wageFloor) };
    for (const [k, v] of Object.entries(nums)) {
      if (!Number.isFinite(v) || v < 0) throw new Error(`rate-bands.csv:${line}: ${k} is not a non-negative number`);
    }
    // A band whose quartiles are out of order is not a band. Catching it here
    // beats discovering it as a nonsensical range on stage.
    if (!(nums.p25 <= nums.p50 && nums.p50 <= nums.p75)) {
      throw new Error(`rate-bands.csv:${line}: needs p25 <= p50 <= p75, got ${nums.p25}/${nums.p50}/${nums.p75}`);
    }
    if (!trade || !taskCode || !source) throw new Error(`rate-bands.csv:${line}: trade, task_code and source are all required`);
    return { trade, taskCode, unit, ...nums, source, line };
  });
}

async function main() {
  const reset = process.argv.includes('--reset');
  const allowUnsourced = process.argv.includes('--allow-unsourced');

  const csvPath = path.resolve(process.cwd(), 'data/rate-bands.csv');
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));

  const unsourced = rows.filter((r) => r.source === UNSOURCED_SENTINEL);

  if (unsourced.length > 0 && !allowUnsourced) {
    console.error(`\n[seed:rates] REFUSED. ${unsourced.length} of ${rows.length} rows are still unsourced.\n`);
    for (const r of unsourced.slice(0, 5)) {
      console.error(`  rate-bands.csv:${r.line}  ${r.trade}/${r.taskCode}`);
    }
    if (unsourced.length > 5) console.error(`  ... and ${unsourced.length - 5} more`);
    console.error('\n  Put a real citation in the `source` column, or pass --allow-unsourced');
    console.error('  to seed them anyway. They will be labelled as placeholders in the API,');
    console.error('  and `npm run check:rates` will keep failing until they are sourced.\n');
    process.exit(1);
  }

  const db = await connectDb();
  if (!db) {
    console.error('\n[seed:rates] No database connection. Check MONGODB_URI and the Atlas allowlist.\n');
    process.exit(1);
  }

  if (reset) {
    await getDb().collection(RATE_BANDS).drop().catch(() => {});
    console.log('[seed:rates] dropped rate_bands');
  }

  const now = new Date().toISOString();

  for (const r of rows) {
    const band: RateBand = {
      trade: r.trade,
      taskCode: r.taskCode,
      // '*' is the national fallback used when no locality-specific band exists.
      locality: '*',
      p25: r.p25,
      p50: r.p50,
      p75: r.p75,
      // Zero real observations. The API reports this honestly rather than
      // implying the band was fitted from settled jobs.
      sampleN: 0,
      wageFloor: r.wageFloor,
      // The citation, verbatim, or the self-declaring placeholder label. Never
      // a source the row does not actually carry.
      seededFrom: r.source === UNSOURCED_SENTINEL ? UNSOURCED_LABEL : r.source,
      updatedAt: now,
    };
    await getDb().collection(RATE_BANDS).updateOne(
      { trade: r.trade, taskCode: r.taskCode, locality: '*' },
      { $set: band },
      { upsert: true }
    );
  }

  await getDb().collection(RATE_BANDS).createIndex({ trade: 1, taskCode: 1, locality: 1 }, { unique: true });

  const sourced = rows.length - unsourced.length;
  console.log(`\n[seed:rates] wrote ${rows.length} bands across ${new Set(rows.map((r) => r.trade)).size} trades`);
  console.log(`[seed:rates] sourced: ${sourced}/${rows.length}`);

  if (unsourced.length > 0) {
    console.log('[seed:rates] ');
    console.log(`[seed:rates] *** ${unsourced.length} BANDS ARE UNSOURCED AND SEEDED ANYWAY (--allow-unsourced). ***`);
    console.log('[seed:rates] They report seededFrom as:');
    console.log(`[seed:rates]   "${UNSOURCED_LABEL}"`);
    console.log('[seed:rates] so the API cannot present them as authoritative.');
    console.log('[seed:rates] Run `npm run check:rates` before the demo.');
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error('\n[seed:rates] failed:', err.message, '\n');
  await closeDb().catch(() => {});
  process.exit(1);
});
