import type { ReliabilityEventType } from '../../types';

/**
 * The reliability score: a PURE function of the event ledger and the clock.
 *
 * Owner: Track A. See KAARIGAR_RELIABILITY_FEATURE.md §2 and §9.5.
 *
 * This module imports no database, no config and no Express. That is what lets
 * the scoring tests run without a cluster, and it is also the honest boundary:
 * the score is a published rubric, not a model, and anyone should be able to
 * read these forty lines and reproduce their own number by hand.
 */

export const WEIGHT: Record<ReliabilityEventType, number> = {
  ON_TIME: 1,
  LATE: -0.5,
  LATE_CANCEL: -1,
  NO_SHOW: -3,
  EXPIRED: 0,
};

/**
 * The starting assumption about a worker nobody has any evidence about, and how
 * many events' worth of weight that assumption is worth.
 *
 * A NEW WORKER IS NOT A BAD WORKER. Architecture §11 is explicit that a new
 * joiner must not start at zero - it would be a lie about someone's livelihood
 * rather than a rounding choice - and the reviews layer already follows the
 * same rule with its own 3.5 prior. PRIOR_N = 5 means roughly five clean visits
 * are needed before the evidence outweighs the assumption in either direction.
 */
export const PRIOR = 0.8;
export const PRIOR_N = 5;

/**
 * How fast the past stops counting. At 45 days an event is worth half what it
 * was; at six months, about a sixteenth.
 *
 * This is the mechanism by which a bad week does not become a permanent mark.
 * A worker who no-shows once and then works reliably for two months has visibly
 * recovered, which is the difference between a score that measures behaviour
 * and one that merely records an accusation.
 */
export const HALF_LIFE_DAYS = 45;

const DAY_MS = 86_400_000;

/** One ledger row, reduced to the only two things the score reads. */
export interface ScoredEvent {
  type: ReliabilityEventType;
  /** Epoch milliseconds. */
  at: number;
}

/**
 * Reliability in 0..1. Verbatim from §2 of the brief.
 *
 * `at` IS EPOCH MILLISECONDS, not an ISO string - the only place in this
 * feature where that is true. Decay is arithmetic on instants, and parsing a
 * date inside the loop for every event on every passport render would be work
 * done for nothing. The conversion happens once, at the single call site in
 * data/reliability.ts, and epoch ms never enters the frozen contract.
 *
 * Note which side of the ratio each weight lands on: a negative event adds to
 * `total` but not to `good`, so a penalty dilutes the score rather than
 * subtracting from it. That is why the result cannot run away below zero and
 * why one bad visit against a long clean record barely moves the number.
 */
export function computeReliability(events: ScoredEvent[], now = Date.now()): number {
  let good = PRIOR * PRIOR_N;
  let total = PRIOR_N;

  for (const event of events) {
    const weight = WEIGHT[event.type];
    // EXPIRED. Recorded as a fact, deliberately worth nothing to this score -
    // it feeds responseRate instead. Skipped before touching `total` so it
    // cannot dilute the ratio either.
    if (weight === 0) continue;

    const decay = Math.pow(0.5, (now - event.at) / DAY_MS / HALF_LIFE_DAYS);
    if (weight > 0) good += decay * weight;
    total += decay * Math.abs(weight);
  }

  return Math.min(1, Math.max(0, good / total));
}

/**
 * Reliability (0..1) mapped onto TrustScoreComponents.reliabilityRecord (-10..0).
 *
 * ANCHORED AT THE PRIOR, NOT AT 1.0. Scaling from a perfect score would hand a
 * brand-new worker -2 for the crime of having no history, which is the exact
 * failure the prior exists to prevent. Anchoring here means "no evidence" maps
 * to no penalty, and only evidence of unreliability moves the number.
 *
 * This REPLACES the cancellation-rate source that previously fed this
 * component. That rate counted customer cancellations against the worker, had
 * no time decay, and - now that an expiry or a no-show cancels the job - would
 * have counted every ledger penalty a second time. See §9.5.
 *
 * Reliability ABOVE the prior clamps to 0 rather than going positive: this
 * component's published range is -10..0, and good reliability is already paid
 * for elsewhere in the rubric. The Reliability % line on the passport is where
 * a worker sees credit for it.
 */
export function reliabilityRecord(reliability: number): number {
  const penalty = (PRIOR - reliability) / PRIOR;
  return -Math.round(Math.min(10, Math.max(0, penalty * 10)));
}

/**
 * How often the kaarigar ANSWERS a request at all, in 0..1.
 *
 *     (accepted + declined) / (accepted + declined + expired)
 *
 * A DECLINE COUNTS AS A RESPONSE, because it is one. §2 originally put it in
 * the denominator only, which made this an acceptance rate wearing the word
 * "response" and quietly punished the single most useful thing a busy worker
 * can do: say no, quickly, so the customer can ask someone else. A kaarigar who
 * declines ten jobs honestly has answered ten times; a kaarigar who ignores ten
 * has answered none, and only the second should show a low number here.
 *
 * Only SILENCE counts against the worker, which is why the expiries sit in the
 * denominator alone.
 *
 * Returns 1 when there is nothing to judge. A worker who has never been asked
 * has not failed to answer, and rendering that as 0% would be the same lie
 * about a new joiner that PRIOR exists to prevent. The UI branches on the
 * underlying count and says "no requests yet" rather than printing a perfect
 * score.
 */
export function responseRate(accepted: number, declined: number, expiredUnanswered: number): number {
  const answered = accepted + declined;
  const total = answered + expiredUnanswered;
  if (total === 0) return 1;
  return Math.min(1, Math.max(0, answered / total));
}
