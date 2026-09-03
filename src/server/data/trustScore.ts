import type { TrustScore } from '../../types';
import { summariseFor } from './reviews';
import { countJobOutcomes } from './jobs';

/**
 * Compute the public trust rubric from evidence the prototype really owns.
 *
 * This is intentionally not a machine-learning score and it does not treat a
 * self-entered skill or certificate as verified. Phone OTP is the only current
 * identity evidence, so the identity component receives 10/20 rather than a
 * misleading full score. Work history is capped at 15/25 because the MVP cut
 * photos and independent customer accounts; the UI names those limitations.
 */
export async function calculateTrustScore(userId: string): Promise<TrustScore> {
  const [jobs, reviews] = await Promise.all([countJobOutcomes(userId), summariseFor(userId)]);

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

  const cancelledDenominator = jobs.completed + jobs.cancelled;
  const cancellationRate = cancelledDenominator === 0
    ? 0
    : jobs.cancelled / cancelledDenominator;
  const reliabilityRecord = -Math.round(Math.min(10, cancellationRate * 10));
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
