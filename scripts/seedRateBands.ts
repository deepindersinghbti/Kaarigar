/**
 * Seed the rate_bands collection.
 *
 * Owner: Track A. Run with:  npm run seed:rates
 *
 * ============================================================================
 * THE NUMBERS BELOW ARE PLACEHOLDERS AND ARE NOT SOURCED FROM ANY PUBLISHED
 * SCHEDULE. They exist so the mechanism can be built and demonstrated. They
 * MUST be replaced with real figures from the CPWD Delhi Schedule of Rates,
 * the relevant state PWD schedule, and the applicable minimum-wage
 * notification before the demo.
 *
 * seededFrom is a CITATION FIELD and is deliberately set to a placeholder
 * string rather than "CPWD DSR 2024". The API surfaces that string as the
 * band's stated basis, so an unsourced band announces itself instead of
 * passing as authoritative. Section 14.1 is explicit that claiming an
 * integration or a source you do not have is the fastest way to lose a panel,
 * and a fabricated government citation is exactly that.
 *
 * Real sources to draw from:
 *   CPWD Delhi Schedule of Rates      cpwd.gov.in
 *   Minimum wages, central sphere      clc.gov.in/clc/min-wages
 *   State PWD schedules                per state PWD site
 * ============================================================================
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectDb, getDb, closeDb } from '../src/server/db';
import { RATE_BANDS } from '../src/server/data/rateBands';
import type { RateBand } from '../src/types';

const UNSOURCED = 'PLACEHOLDER - not sourced, replace before demo';

/** wageFloor is a per-task floor, also a placeholder pending the real notification. */
type SeedRow = [trade: string, taskCode: string, p25: number, p50: number, p75: number, wageFloor: number];

const ROWS: SeedRow[] = [
  // Electrician
  ['electrician', 'fan_install',            400,   600,   850,   350],
  ['electrician', 'fan_repair',             250,   400,   600,   350],
  ['electrician', 'switchboard_install',    800,  1200,  1800,   350],
  ['electrician', 'mcb_replace',            600,   900,  1400,   350],
  ['electrician', 'house_wiring_point',     250,   350,   500,   350],
  ['electrician', 'inverter_install',      1200,  1800,  2600,   350],
  ['electrician', 'geyser_point',           700,  1000,  1500,   350],
  ['electrician', 'earthing_check',         500,   800,  1200,   350],
  ['electrician', 'light_fitting',          200,   300,   450,   350],
  ['electrician', 'fault_diagnosis',        300,   500,   800,   350],

  // Plumber
  ['plumber',     'tap_replace',            200,   350,   500,   350],
  ['plumber',     'leak_repair',            300,   500,   800,   350],
  ['plumber',     'toilet_install',        1200,  1800,  2500,   350],
  ['plumber',     'pipe_replace_metre',     150,   250,   400,   350],
  ['plumber',     'water_tank_clean',       600,   900,  1400,   350],
  ['plumber',     'motor_install',          800,  1200,  1800,   350],
  ['plumber',     'drain_unblock',          400,   650,  1000,   350],
  ['plumber',     'geyser_plumbing',        700,  1000,  1500,   350],

  // Carpenter
  ['carpenter',   'door_repair',            400,   700,  1100,   350],
  ['carpenter',   'lock_install',           250,   400,   600,   350],
  ['carpenter',   'furniture_repair',       500,   900,  1500,   350],
  ['carpenter',   'window_frame',          1000,  1600,  2400,   350],
  ['carpenter',   'shelf_install',          400,   650,  1000,   350],
  ['carpenter',   'modular_fitting_day',   1000,  1400,  2000,   350],

  // Painter
  ['painter',     'wall_paint_sqft',          8,    14,    22,   350],
  ['painter',     'putty_sqft',                6,   10,    16,   350],
  ['painter',     'wood_polish_sqft',         15,   25,    40,   350],
  ['painter',     'day_rate',                700, 1000,  1500,   350],

  // Mason
  ['mason',       'brickwork_sqft',           35,   55,    80,   350],
  ['mason',       'plaster_sqft',             18,   28,    45,   350],
  ['mason',       'tile_laying_sqft',         30,   50,    75,   350],
  ['mason',       'day_rate',                800, 1100,  1600,   350],
];

async function main() {
  const reset = process.argv.includes('--reset');
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
  let written = 0;

  for (const [trade, taskCode, p25, p50, p75, wageFloor] of ROWS) {
    const band: RateBand = {
      trade,
      taskCode,
      // '*' is the national fallback used when no locality-specific band exists.
      locality: '*',
      p25,
      p50,
      p75,
      // Zero real observations. The API reports this honestly rather than
      // implying the band was fitted from settled jobs.
      sampleN: 0,
      wageFloor,
      seededFrom: UNSOURCED,
      updatedAt: now,
    };
    await getDb().collection(RATE_BANDS).updateOne(
      { trade, taskCode, locality: '*' },
      { $set: band },
      { upsert: true }
    );
    written++;
  }

  await getDb().collection(RATE_BANDS).createIndex({ trade: 1, taskCode: 1, locality: 1 }, { unique: true });

  console.log(`\n[seed:rates] wrote ${written} bands across ${new Set(ROWS.map((r) => r[0])).size} trades`);
  console.log('[seed:rates] ');
  console.log('[seed:rates] *** THESE FIGURES ARE PLACEHOLDERS AND ARE NOT SOURCED. ***');
  console.log('[seed:rates] Every band reports seededFrom as:');
  console.log(`[seed:rates]   "${UNSOURCED}"`);
  console.log('[seed:rates] so the API cannot present them as authoritative.');
  console.log('[seed:rates] Replace with CPWD DSR / state PWD / minimum-wage figures before the demo.\n');

  await closeDb();
}

main().catch(async (err) => {
  console.error('[seed:rates] failed:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
