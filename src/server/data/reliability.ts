import { getDb } from '../db';
import { uuidv7 } from '../../lib/ids';
import { nowMs, DAY_MS } from '../bookingConfig';
import { BOOKINGS } from './bookings';
import { summariseFor } from './reviews';
import { computeReliability, responseRate, type ScoredEvent } from '../lib/reliabilityScore';
import type { ReliabilityEventType, WorkerStats } from '../../types';

/**
 * The reliability ledger: APPEND-ONLY. Nothing here updates or deletes a row.
 *
 * Owner: Track A. This module owns the collection per Architecture §5.2.
 *
 * WHY APPEND-ONLY MATTERS HERE and is not just tidiness. This ledger is the
 * evidence behind a number shown on a public passport that affects whether
 * someone gets hired. A score computed from rows that can be edited is a score
 * whose history cannot be audited, and "we recalculated" becomes
 * indistinguishable from "we changed our mind about what happened". The same
 * rule the kamai ledger already follows, for the same reason.
 */

export const RELIABILITY_EVENTS = 'reliability_events';

/** How far back responseRate looks. §2. */
const RESPONSE_WINDOW_DAYS = 90;

export interface ReliabilityEventDoc {
  _id: string;
  bookingId: string;
  kaarigarId: string;
  type: ReliabilityEventType;
  at: Date;
}

let indexesReady = false;

export async function ensureReliabilityIndexes(): Promise<void> {
  if (indexesReady) return;
  const collection = getDb().collection(RELIABILITY_EVENTS);

  /**
   * THE UNIQUE INDEX IS THE IDEMPOTENCY MECHANISM, not a validation.
   *
   * Two concurrent sweeps, a sweep racing a read-path check, or a retried
   * request can all try to write the same penalty. A read-then-insert check
   * would let both pass; only the index makes the second one impossible. This
   * is what "a penalty can never be applied twice" means in §0.5.
   *
   * It also admits the one case that must NOT be collapsed: a booking that goes
   * LATE and then NO_SHOW keeps both, because they are different types.
   */
  await collection.createIndex({ bookingId: 1, type: 1 }, { unique: true });
  await collection.createIndex({ kaarigarId: 1, at: -1 });

  indexesReady = true;
}

export type AppendOutcome = 'written' | 'duplicate';

/**
 * Record one event. A duplicate is SUCCESS, not an error.
 *
 * The caller has already made the state transition atomically; this is the
 * bookkeeping that follows it. If the row is already there then the fact it
 * records is already true, and reporting a failure would make a correct,
 * idempotent replay look like a broken one - which is how a sweeper ends up
 * being called less often than it should be.
 */
export async function appendEvent(params: {
  bookingId: string;
  kaarigarId: string;
  type: ReliabilityEventType;
  at?: number;
}): Promise<AppendOutcome> {
  await ensureReliabilityIndexes();

  const doc: ReliabilityEventDoc = {
    _id: uuidv7(),
    bookingId: params.bookingId,
    kaarigarId: params.kaarigarId,
    type: params.type,
    at: new Date(params.at ?? nowMs()),
  };

  try {
    await getDb().collection(RELIABILITY_EVENTS).insertOne(doc as never);
    return 'written';
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return 'duplicate';
    throw err;
  }
}

/**
 * Every event for one kaarigar, reduced to what the score reads.
 *
 * THE ONE PLACE Date BECOMES EPOCH MILLISECONDS. computeReliability does
 * arithmetic on instants and takes numbers; the ledger stores Dates; the
 * contract carries ISO strings. Converting here, once, keeps all three honest
 * and keeps epoch ms out of every other module.
 */
export async function eventsFor(kaarigarId: string): Promise<ScoredEvent[]> {
  await ensureReliabilityIndexes();
  const docs = await getDb()
    .collection(RELIABILITY_EVENTS)
    .find({ kaarigarId })
    .sort({ at: -1 })
    .toArray();

  return docs.map((doc) => ({
    type: doc.type as ReliabilityEventType,
    at: doc.at instanceof Date ? doc.at.getTime() : new Date(String(doc.at)).getTime(),
  }));
}

export interface EventCounts {
  onTime: number;
  late: number;
  noShow: number;
  lateCancel: number;
  expired: number;
}

export async function countsFor(kaarigarId: string): Promise<EventCounts> {
  await ensureReliabilityIndexes();
  const rows = await getDb()
    .collection(RELIABILITY_EVENTS)
    .aggregate([{ $match: { kaarigarId } }, { $group: { _id: '$type', n: { $sum: 1 } } }])
    .toArray();

  const byType = new Map(rows.map((r) => [String(r._id), Number(r.n)]));
  return {
    onTime: byType.get('ON_TIME') ?? 0,
    late: byType.get('LATE') ?? 0,
    noShow: byType.get('NO_SHOW') ?? 0,
    lateCancel: byType.get('LATE_CANCEL') ?? 0,
    expired: byType.get('EXPIRED') ?? 0,
  };
}

/**
 * The three numbers behind responseRate, over the last 90 days.
 *
 * Counted from the BOOKINGS, not from the ledger, because two of the three
 * outcomes write no event at all - a decline is silent by design, and an
 * accepted request has nothing to record until something goes wrong.
 *
 * "Did the kaarigar ever respond?" is asked as `history.to === 'RESPONDED'`
 * rather than by reading the current status. The status has moved on by then,
 * and - since EXPIRED is now reachable two ways - the current status alone
 * cannot distinguish a request that was never answered from an agreed job whose
 * slot was never named. The history can, because it records the path rather
 * than the destination.
 */
export async function responseCountsFor(
  kaarigarId: string,
  now = nowMs()
): Promise<{ accepted: number; declined: number; expiredUnanswered: number }> {
  const since = new Date(now - RESPONSE_WINDOW_DAYS * DAY_MS);
  const collection = getDb().collection(BOOKINGS);
  const window = { kaarigarId, createdAt: { $gte: since } };

  const [accepted, declined, expiredUnanswered] = await Promise.all([
    collection.countDocuments({ ...window, 'history.to': 'RESPONDED' }),
    collection.countDocuments({ ...window, status: 'DECLINED' }),
    collection.countDocuments({ ...window, status: 'EXPIRED', 'history.to': { $ne: 'RESPONDED' } }),
  ]);

  return { accepted, declined, expiredUnanswered };
}

/**
 * Everything the passport and the public page need about one kaarigar.
 *
 * DERIVED ON READ, not cached on the user document as §2 suggested. The cache
 * §2 describes has to be invalidated by every ledger insert and every new
 * review, and a stale reputation number is worse than a freshly computed one:
 * this is six unpaginated passports and a handful of events, so the aggregate
 * costs less than the invalidation logic would. When the directory outgrows a
 * screenful this becomes a cached field, alongside the stored area the
 * directory will need by then.
 */
export async function statsFor(kaarigarId: string, now = nowMs()): Promise<WorkerStats> {
  return (await reliabilitySummaryFor(kaarigarId, now)).stats;
}

/**
 * WorkerStats plus the two sample sizes a screen needs to render it honestly.
 *
 * WHY THE SAMPLE SIZES TRAVEL WITH THE NUMBERS. Both ratios have a deliberate
 * floor for a worker with no history - reliability starts at the 0.8 prior, and
 * responseRate is 1 when there is nothing to judge - so that nobody is scored
 * as bad for being new. But printed as-is, that same floor reads "80% reliable"
 * and "replies to 100% of requests" about someone who has never been booked,
 * which is a claim the evidence does not support in the other direction.
 *
 * So the passport and the public page show a percentage ONLY when there is a
 * record behind it, and say "no visits yet" otherwise. The counts are not in
 * WorkerStats because they describe the sample rather than the worker, and the
 * contract type should stay a description of the worker.
 *
 *   recordedEvents  every scored ledger row (ON_TIME, LATE, NO_SHOW,
 *                   LATE_CANCEL). EXPIRED is excluded: it carries no weight, so
 *                   it cannot have moved reliability off the prior.
 *   requestCount    requests the kaarigar could have answered in the last 90
 *                   days - the responseRate denominator.
 */
export interface ReliabilitySummary {
  stats: WorkerStats;
  recordedEvents: number;
  requestCount: number;
}

export async function reliabilitySummaryFor(
  kaarigarId: string,
  now = nowMs()
): Promise<ReliabilitySummary> {
  const [events, counts, responses, reviews] = await Promise.all([
    eventsFor(kaarigarId),
    countsFor(kaarigarId),
    responseCountsFor(kaarigarId, now),
    summariseFor(kaarigarId),
  ]);

  const stats: WorkerStats = {
    // summariseFor returns null rather than 0 when there are no reviews, on the
    // principle that a 0-star worker and an unrated one are different claims.
    // reviewCount is what the UI branches on; avgStars is not meaningful at 0.
    avgStars: reviews.average ?? 0,
    reviewCount: reviews.count,
    reliability: computeReliability(events, now),
    // @deprecated in the contract, and 0 here rather than computed. There is
    // one public score and it is TrustScore.value. See §9.1 D4.
    trustScore: 0,
    responseRate: responseRate(responses.accepted, responses.declined, responses.expiredUnanswered),
    onTime: counts.onTime,
    late: counts.late,
    noShow: counts.noShow,
    updatedAt: new Date(now).toISOString(),
  };

  return {
    stats,
    recordedEvents: counts.onTime + counts.late + counts.noShow + counts.lateCancel,
    requestCount: responses.accepted + responses.declined + responses.expiredUnanswered,
  };
}
