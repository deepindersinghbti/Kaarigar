import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected } from '../db';
import { requireAuth } from '../middleware/auth';
import { getProfileIdForUser } from '../data/profiles';
import { createJob, jobExists } from '../data/jobs';
import { createEntry } from '../data/ledger';

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
};

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
        results[i] = {
          index: i, kind: 'unknown', id,
          status: 'rejected',
          reason: 'unknown_kind',
          message: "kind must be 'job' or 'ledger_entry'.",
        };
        continue;
      }

      try {
        if (item.kind === 'job') {
          const outcome = await createJob(uid, item.payload);
          if (outcome.status === 'rejected') {
            results[i] = {
              index: i, kind: 'job', id,
              status: 'rejected', reason: 'validation_failed',
              field: outcome.field, message: outcome.message,
            };
          } else {
            results[i] = {
              index: i, kind: 'job', id: outcome.job.id,
              status: outcome.status === 'duplicate' ? 'duplicate' : 'accepted',
            };
          }
          continue;
        }

        // ledger_entry
        if (!profileId) {
          results[i] = {
            index: i, kind: 'ledger_entry', id,
            status: 'rejected', reason: 'no_profile',
            message: 'This user has no passport yet. Call GET /api/passport/me before syncing entries.',
          };
          continue;
        }

        // A ledger entry may reference a job. Reject a dangling link with a
        // specific reason rather than silently storing an orphan that the
        // passport would later fail to render.
        const jobId = (item.payload as { jobId?: unknown } | null)?.jobId;
        if (typeof jobId === 'string' && jobId && !(await jobExists(uid, jobId))) {
          results[i] = {
            index: i, kind: 'ledger_entry', id,
            status: 'rejected', reason: 'unknown_job',
            field: 'jobId',
            message: `No job ${jobId} for this user. Sync the job before its ledger entry.`,
          };
          continue;
        }

        const outcome = await createEntry(profileId, item.payload);
        if (outcome.status === 'rejected') {
          results[i] = {
            index: i, kind: 'ledger_entry', id,
            status: 'rejected', reason: 'validation_failed',
            field: outcome.field, message: outcome.message,
          };
        } else {
          results[i] = {
            index: i, kind: 'ledger_entry', id: outcome.entry.id,
            status: outcome.status === 'duplicate' ? 'duplicate' : 'accepted',
          };
        }
      } catch (err) {
        // One item throwing must not abort the flush.
        console.error(`[sync] item ${i} (${item.kind}) failed:`, err);
        results[i] = {
          index: i, kind: item.kind, id,
          status: 'rejected', reason: 'server_error',
          message: 'This item could not be stored. It remains queued; retry it.',
        };
      }
    }

    const accepted = results.filter((r) => r.status === 'accepted').length;
    const duplicates = results.filter((r) => r.status === 'duplicate').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;

    console.log(`[sync] batch of ${items.length}: ${accepted} accepted, ${duplicates} duplicate, ${rejected} rejected`);

    return res.json({
      processed: items.length,
      accepted,
      duplicates,
      rejected,
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
