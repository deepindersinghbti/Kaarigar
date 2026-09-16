import type { TrustScore } from '../../types';
import { summariseFor } from './reviews';
import type { ReviewSummary } from './reviews';
import { countJobOutcomes } from './jobs';
import type { JobOutcomeCounts } from './jobs';
import { bookingsEnabled, nowMs } from '../bookingConfig';
import { computeReliability, reliabilityRecord as reliabilityRecordFor } from '../lib/reliabilityScore';
import { eventsFor } from './reliability';

export interface TrustEvidence {
  jobs: JobOutcomeCounts;
  reviews: ReviewSummary;
  score: TrustScore;
}

/**
 * Compute the public trust rubric from evidence the prototype really owns.
 *
 * This is intentionally not a machine-learning score and it does not treat a
 * self-entered skill or certificate as verified. Phone OTP is the only current
 * identity evidence, so the identity component receives 10/20 rather than a
 * misleading full score. Work history is capped at 15/25 because the MVP cut
 * photos and independent customer accounts; the UI names those limitations.
 */
export function calculateTrustScoreFromEvidence(
  jobs: JobOutcomeCounts,
  reviews: ReviewSummary,
  /**
   * Reliability in 0..1 from the event ledger, when the booking feature is on.
   *
   * Optional, and undefined means "fall back to the cancellation rate below" -
   * which is what keeps this function byte-for-byte compatible with the two
   * callers that predate the ledger. See the reliabilityRecord note below.
   */
  reliability?: number
): TrustScore {
  const identityVerification = 10;
  const skillCredentials = 0;
  const verifiedWorkHistory = Math.min(15, jobs.completed * 3);

  let customerRatings = 0;
  if (reviews.average !== null && reviews.count > 0) {
    // A small neutral prior prevents one five-star review from looking like a
    // mature record while still rewarding the first real customer feedback.
    const priorAverage = 3.5;
    const priorWeight = 3;
    const adjusted = (reviews.average * reviews.count + priorAverage * priorWeight) /
      (reviews.count + priorWeight);
    customerRatings = Math.round(Math.max(0, Math.min(25, ((adjusted - 1) / 4) * 25)));
  }

  /**
   * TWO SOURCES, ONE COMPONENT. See KAARIGAR_RELIABILITY_FEATURE.md §9.5.
   *
   * With the booking feature ON this is the decayed event ledger: on-time
   * arrivals, lateness, no-shows and late cancels, anchored so that a worker
   * with no history scores 0 rather than being penalised for being new.
   *
   * With it OFF - the default - this is the original cancellation rate,
   * unchanged, so the rubric a passport already displays does not move under
   * anyone's feet.
   *
   * The ledger REPLACES rather than supplements the rate, because once bookings
   * are live the rate is actively wrong: it counts CUSTOMER cancellations
   * against the worker, and an expiry or a no-show now cancels the job, so
   * every ledger penalty would be counted a second time as a cancellation. It
   * also has no time decay, which makes a bad week permanent.
   */
  let reliabilityRecord: number;
  if (typeof reliability === 'number') {
    reliabilityRecord = reliabilityRecordFor(reliability);
  } else {
    const cancelledDenominator = jobs.completed + jobs.cancelled;
    const cancellationRate = cancelledDenominator === 0
      ? 0
      : jobs.cancelled / cancelledDenominator;
    reliabilityRecord = -Math.round(Math.min(10, cancellationRate * 10));
  }
  const skillingEngagement = 0;

  const components = {
    identityVerification,
    skillCredentials,
    verifiedWorkHistory,
    customerRatings,
    reliabilityRecord,
    skillingEngagement,
  };

  const value = Math.max(
    0,
    Math.min(100, Object.values(components).reduce((sum, component) => sum + component, 0))
  );

  return { value, components, computedAt: new Date().toISOString() };
}

/**
 * Return the evidence and score together so passport callers cannot display
 * editable profile counters beside a server-derived trust score.
 */
export async function calculateTrustEvidence(userId: string): Promise<TrustEvidence> {
  const [jobs, reviews] = await Promise.all([countJobOutcomes(userId), summariseFor(userId)]);

  /**
   * The ledger is read ONLY when the feature is on. With the flag off nothing
   * queries reliability_events at all, so a deployment that never turned this
   * on does not pay for a collection it does not use - and, more to the point,
   * cannot have its published trust score changed by rows it is not reading.
   */
  let reliability: number | undefined;
  if (bookingsEnabled()) {
    const now = nowMs();
    reliability = computeReliability(await eventsFor(userId), now);
  }

  return { jobs, reviews, score: calculateTrustScoreFromEvidence(jobs, reviews, reliability) };
}

export async function calculateTrustScore(userId: string): Promise<TrustScore> {
  return (await calculateTrustEvidence(userId)).score;
}
