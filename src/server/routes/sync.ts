import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected } from '../db';
import { requireAuth } from '../middleware/auth';
import { getProfileIdForUser } from '../data/profiles';
import { createJob, jobExists } from '../data/jobs';
import { createEntry } from '../data/ledger';
import { classify } from '../lib/retry';

/**
 * sync-svc - offline outbox ingest.
 *
 * Owner: Track A. Mounted at /api/sync.
 *
 * Section 9.2 step 5: the server "validates, applies idempotently, and returns
 * per-item accept/reject with reasons... rejected items surface a specific,
 * actionable message rather than a generic failure."
 *
 * ONE BAD ITEM MUST NOT SINK THE BATCH. A worker may have a week of offline
 * entries queued. If a single malformed row failed the whole flush, they would
 * lose all of it and have no way to find out which row was at fault. Every item
 * is therefore evaluated independently and reported on individually.
 *
 * Validation is NOT duplicated here - it goes through data/jobs.ts and
 * data/ledger.ts, the same modules the online routes use. Divergent rules
 * between the online and offline paths would produce records that succeed
 * offline and vanish on reconnect, which is exactly the trust failure that
 * visible sync state exists to prevent.
 */

export const syncRouter = Router();

/** Section 9.2 step 3: batches of up to 50. */
const MAX_BATCH = 50;

type ItemKind = 'job' | 'ledger_entry';

interface BatchItem {
  kind: ItemKind;
  payload: unknown;
}

type ItemResult = {
  index: number;
  kind: ItemKind | 'unknown';
  id: string | null;
  status: 'accepted' | 'duplicate' | 'rejected';
  reason?: string;
  message?: string;
  field?: string;
  /** The status this item would have received as a standalone request. */
  httpStatus: number;
  /**
   * Whether the client should keep this item queued. DERIVED from httpStatus by
   * lib/retry.ts and never decided at the rejection site - a permanent failure
   * classified as retryable is an outbox that retries forever, and deciding it
   * per-error-site recreates that bug with every new reason someone adds.
   */
  retryable: boolean;
  /** What the client should set syncState to (section 9.1). */
  syncState: 'pending' | 'failed';
};

/** Build a rejection with its retry disposition derived, not hand-written. */
function reject(
  index: number,
  kind: ItemKind | 'unknown',
  id: string | null,
  httpStatus: number,
  reason: string,
  message: string,
  field?: string
): ItemResult {
  return { index, kind, id, status: 'rejected', reason, message, field, httpStatus, ...classify(httpStatus) };
}

function accept(index: number, kind: ItemKind, id: string, duplicate: boolean): ItemResult {
  // A duplicate means the server already holds it - success from the outbox's
  // point of view, not something to retry.
  return {
    index,
    kind,
    id,
    status: duplicate ? 'duplicate' : 'accepted',
    httpStatus: duplicate ? 200 : 201,
    retryable: false,
    syncState: 'pending',
  };
}

function dbGuard(res: Response): boolean {
  if (isDbConnected()) return true;
  res.status(503).json({
    error: 'database_unavailable',
    message: 'Check MONGODB_URI and the Atlas Network Access allowlist.',
  });
  return false;
}

const idOf = (payload: unknown): string | null => {
  const id = (payload as { id?: unknown } | null)?.id;
  return typeof id === 'string' && id ? id : null;
};

const CONFLICT_MESSAGE = 'That id is already in use. Generate a new one and retry.';

/**
 * POST /api/sync/batch
 *
 * Body: { items: [{ kind: 'job' | 'ledger_entry', payload: {...} }, ...] }
 *
 * Returns 200 with per-item results even when every item was rejected. The
 * HTTP status describes whether the batch was processed, not whether every item
 * succeeded - a 4xx here would tell the client to retry the whole batch, which
 * for permanently-invalid rows is an infinite loop.
 */
syncRouter.post('/batch', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const items = (req.body ?? {}).items;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'invalid_batch', message: 'items must be an array.' });
  }
  if (items.length === 0) {
    return res.status(400).json({ error: 'empty_batch', message: 'items must contain at least one item.' });
  }
  if (items.length > MAX_BATCH) {
    return res.status(413).json({
      error: 'batch_too_large',
      message: `At most ${MAX_BATCH} items per batch. Split the outbox flush.`,
      max: MAX_BATCH,
      received: items.length,
    });
  }

  try {
    const uid = req.user!.uid;
    const profileId = await getProfileIdForUser(uid);

    const results: ItemResult[] = new Array(items.length);

    /**
     * CAUSAL ORDER (section 9.2 step 3): jobs before the ledger entries that
     * reference them. The client is supposed to flush in this order, but the
     * server sorts anyway - trusting client ordering means a batch that arrives
     * slightly out of order rejects entries whose job is sitting three items
     * further down the same request.
     *
     * Results are returned in the ORIGINAL request order so the client can
     * correlate by index without tracking the reordering.
     */
    const order: number[] = [];
    items.forEach((it: BatchItem, i: number) => {
      if (it?.kind === 'job') order.push(i);
    });
    items.forEach((it: BatchItem, i: number) => {
      if (it?.kind !== 'job') order.push(i);
    });

    for (const i of order) {
      const item = items[i] as BatchItem;
      const id = idOf(item?.payload);

      if (item?.kind !== 'job' && item?.kind !== 'ledger_entry') {
        results[i] = reject(i, 'unknown', id, 400, 'unknown_kind', "kind must be 'job' or 'ledger_entry'.");
        continue;
      }

      try {
        if (item.kind === 'job') {
          const outcome = await createJob(uid, item.payload);
          if (outcome.status === 'rejected') {
            results[i] = reject(i, 'job', id, 400, 'validation_failed', outcome.message, outcome.field);
          } else if (outcome.status === 'conflict') {
            // Generic to the client; detail to the log.
            console.warn(`[sync] id conflict: job ${id} requested by uid=${uid}`);
            results[i] = reject(i, 'job', id, 409, 'id_conflict', CONFLICT_MESSAGE);
          } else {
            results[i] = accept(i, 'job', outcome.job.id, outcome.status === 'duplicate');
          }
          continue;
        }

        // ledger_entry
        if (!profileId) {
          results[i] = reject(
            i, 'ledger_entry', id, 409, 'no_profile',
            'This user has no passport yet. Call GET /api/passport/me before syncing entries.'
          );
          continue;
        }

        // A ledger entry may reference a job. Reject a dangling link with a
        // specific reason rather than silently storing an orphan that the
        // passport would later fail to render.
        const jobId = (item.payload as { jobId?: unknown } | null)?.jobId;
        if (typeof jobId === 'string' && jobId && !(await jobExists(uid, jobId))) {
          results[i] = reject(
            i, 'ledger_entry', id, 400, 'unknown_job',
            `No job ${jobId} for this user. Sync the job before its ledger entry.`, 'jobId'
          );
          continue;
        }

        const outcome = await createEntry(profileId, item.payload);
        if (outcome.status === 'rejected') {
          results[i] = reject(i, 'ledger_entry', id, 400, 'validation_failed', outcome.message, outcome.field);
        } else if (outcome.status === 'conflict') {
          console.warn(`[sync] id conflict: ledger_entry ${id} requested by uid=${uid}`);
          results[i] = reject(i, 'ledger_entry', id, 409, 'id_conflict', CONFLICT_MESSAGE);
        } else {
          results[i] = accept(i, 'ledger_entry', outcome.entry.id, outcome.status === 'duplicate');
        }
      } catch (err) {
        // One item throwing must not abort the flush. 500 classifies as
        // retryable - genuinely transient, unlike the 4xx rejections above.
        console.error(`[sync] item ${i} (${item.kind}) failed:`, err);
        results[i] = reject(
          i, item.kind, id, 500, 'server_error',
          'This item could not be stored. It remains queued; retry it.'
        );
      }
    }

    const accepted = results.filter((r) => r.status === 'accepted').length;
    const duplicates = results.filter((r) => r.status === 'duplicate').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    const permanent = results.filter((r) => r.status === 'rejected' && !r.retryable).length;

    console.log(
      `[sync] batch of ${items.length}: ${accepted} accepted, ${duplicates} duplicate, ` +
      `${rejected} rejected (${permanent} permanent, ${rejected - permanent} retryable)`
    );

    return res.json({
      processed: items.length,
      accepted,
      duplicates,
      rejected,
      // Items the client must DROP from the outbox and mark failed. Leaving
      // them queued is the retry-forever bug.
      permanentlyFailed: permanent,
      // The client marks accepted AND duplicate items synced - a duplicate
      // means the server already holds it, which is success from the outbox's
      // point of view, not a failure to retry forever.
      results,
    });
  } catch (err) {
    console.error('[sync] batch failed:', err);
    return res.status(500).json({ error: 'sync_failed', message: 'Could not process the batch.' });
  }
});
