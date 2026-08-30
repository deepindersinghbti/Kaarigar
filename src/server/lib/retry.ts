/**
 * Retry classification for outbox items.
 *
 * Written ONCE, here, rather than decided per error site. The bug this exists
 * to prevent: a permanent failure reported as retryable leaves the item queued
 * forever, the failed badge never clears, and the worker's outbox retries a
 * request that can never succeed. Classifying per-error-site recreates that bug
 * the next time someone adds a rejection reason.
 *
 * Policy (section 9.1: every record shows pending / synced / failed):
 *   4xx, except 408 and 429  -> PERMANENT. Drop from the outbox, mark failed,
 *                               surface it. Retrying cannot change the outcome.
 *   408, 429, 5xx, network   -> RETRYABLE. Stay queued.
 *
 * Owner: Track A.
 */

export interface RetryDisposition {
  /** Should the client keep this item queued and try again? */
  retryable: boolean;
  /** What the client should set syncState to. 'failed' is already in the contract. */
  syncState: 'pending' | 'failed';
}

export function classify(httpStatus: number): RetryDisposition {
  // Timeouts and throttling are transient by definition, even though they are
  // 4xx - this is the exception the policy turns on.
  if (httpStatus === 408 || httpStatus === 429) {
    return { retryable: true, syncState: 'pending' };
  }
  if (httpStatus >= 400 && httpStatus < 500) {
    return { retryable: false, syncState: 'failed' };
  }
  // 5xx and anything unrecognised, including network-level failures the caller
  // maps to 0, are assumed transient. Erring toward retry is safe here because
  // every write is idempotent on a client-generated id.
  return { retryable: true, syncState: 'pending' };
}
