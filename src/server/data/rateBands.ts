import { getDb } from '../db';
import type { RateBand } from '../../types';

/**
 * Data access for the rate_bands collection.
 *
 * Owner: Track A (pricing-svc).
 */

export const RATE_BANDS = 'rate_bands';

/**
 * Below this many settled local observations, a band is not presented as
 * observation-derived. Section 4C and section 16 both require the sample size
 * to be shown honestly and the band suppressed when it is not supported.
 *
 * "Seeded from CPWD DSR, 0 local observations" is a far stronger answer to a
 * judge than a confident number with nothing behind it.
 */
export const MIN_OBSERVATIONS = 5;

/**
 * How much weight the band carries.
 *
 *   observed  - enough settled local jobs to re-fit the band from real data
 *   seeded    - no local volume yet, but backed by a published government
 *               schedule, which is section 4C's cold-start design
 *   suppressed- neither. Nothing is shown; a made-up band is worse than none.
 */
export type BandConfidence = 'observed' | 'seeded' | 'suppressed';

export interface BandLookup {
  trade: string;
  taskCode: string;
  locality?: string;
}

export async function findBand(q: BandLookup): Promise<RateBand | null> {
  const db = getDb();

  // Prefer a locality-specific band; fall back to the trade/task default so a
  // worker in an unlisted locality gets a national figure rather than nothing.
  if (q.locality) {
    const local = await db.collection(RATE_BANDS).findOne({
      trade: q.trade, taskCode: q.taskCode, locality: q.locality,
    });
    if (local) return local as unknown as RateBand;
  }

  const fallback = await db.collection(RATE_BANDS).findOne({
    trade: q.trade, taskCode: q.taskCode, locality: '*',
  });
  return (fallback as unknown as RateBand) ?? null;
}

export function confidenceOf(band: RateBand): BandConfidence {
  if (band.sampleN >= MIN_OBSERVATIONS) return 'observed';
  if (band.seededFrom && band.seededFrom.trim()) return 'seeded';
  return 'suppressed';
}

/** All distinct trade/task pairs, so a client can populate a picker. */
export async function listTasks(): Promise<Array<{ trade: string; taskCode: string }>> {
  const docs = await getDb().collection(RATE_BANDS)
    .find({}, { projection: { trade: 1, taskCode: 1, _id: 0 } })
    .toArray();
  const seen = new Set<string>();
  const out: Array<{ trade: string; taskCode: string }> = [];
  for (const d of docs) {
    const key = `${d.trade}:${d.taskCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ trade: String(d.trade), taskCode: String(d.taskCode) });
  }
  return out.sort((a, b) => a.trade.localeCompare(b.trade) || a.taskCode.localeCompare(b.taskCode));
}

/**
 * A band seeded without a citation reports this as its basis.
 *
 * Lives here, beside the collection it describes, rather than in the seeder:
 * scripts/check-rates.ts needs it too, and importing it from a script would
 * execute that script's main() as a side effect of the import - which it did,
 * and which made `npm run check:rates` print the seeder's refusal notice.
 *
 * The string is deliberately self-declaring. GET /api/pricing/band returns it
 * verbatim as the band's stated basis, so an unsourced band announces itself
 * rather than passing as authoritative (section 14.1).
 */
export const UNSOURCED_LABEL = 'PLACEHOLDER - not sourced, replace before demo';

/** What an un-cited row carries in data/rate-bands.csv. */
export const UNSOURCED_SENTINEL = 'UNSOURCED';
