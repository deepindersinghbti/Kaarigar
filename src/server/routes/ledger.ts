import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb, isDbConnected } from '../db';
import { requireAuth } from '../middleware/auth';
import { getProfileIdForUser } from '../data/profiles';
import { uuidv7 } from '../../lib/ids';
import type { KamaiEntry, LedgerDirection } from '../../types';
import { ENTRIES, createEntry, ensureLedgerIndexes } from '../data/ledger';
import { queryString } from '../lib/query';

/**
 * ledger-svc - append-only earnings, expenses and udhaar.
 *
 * Owner: Track A. Mounted at /api/ledger.
 *
 * APPEND-ONLY IS THE PRODUCT ARGUMENT, NOT A STYLE CHOICE. Section 4B: there is
 * no update path and no delete path. Corrections are reversing entries. This is
 * what makes the income statement credible to a lender - an editable ledger is
 * a spreadsheet - and it is also what removes most offline-sync conflicts by
 * construction, because two devices cannot disagree about an immutable row, so
 * the merge is a union.
 *
 * Persisted as `ledger_entries` (section 7). The TypeScript type is called
 * KamaiEntry per D4; the collection name follows the architecture.
 */

export const ledgerRouter = Router();

function dbGuard(res: Response): boolean {
  if (isDbConnected()) return true;
  res.status(503).json({
    error: 'database_unavailable',
    message: 'Check MONGODB_URI and the Atlas Network Access allowlist.',
  });
  return false;
}

/** Resolve the caller's profile, or answer 409 telling them how to create one. */
async function requireProfile(req: Request, res: Response): Promise<string | null> {
  const profileId = await getProfileIdForUser(req.user!.uid);
  if (!profileId) {
    res.status(409).json({
      error: 'no_profile',
      message: 'This user has no passport yet. Call GET /api/passport/me first.',
    });
    return null;
  }
  return profileId;
}

/**
 * POST /api/ledger/entries
 *
 * Idempotent on the client-generated UUIDv7. The outbox replays on reconnect
 * and a flaky connection that half-uploads a batch must not double-count
 * income - in a financial record that is the one bug users never forgive.
 */
ledgerRouter.post('/entries', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    const profileId = await requireProfile(req, res);
    if (!profileId) return;

    const outcome = await createEntry(profileId, req.body);

    if (outcome.status === 'rejected') {
      return res.status(400).json({ error: 'invalid_field', field: outcome.field, message: outcome.message });
    }
    if (outcome.status === 'conflict') {
      console.warn(`[ledger] id conflict: ${String((req.body ?? {}).id)} requested by uid=${req.user!.uid}`);
      return res.status(409).json({
        error: 'id_conflict',
        message: 'That id is already in use. Generate a new one and retry.',
      });
    }
    if (outcome.status === 'duplicate') {
      return res.status(200).json({ entry: outcome.entry, idempotentReplay: true });
    }
    return res.status(201).json({ entry: outcome.entry });
  } catch (err) {
    console.error('[ledger] POST /entries failed:', err);
    return res.status(500).json({ error: 'entry_create_failed', message: 'Could not record the entry.' });
  }
});

/**
 * GET /api/ledger/entries?period=day|week|month|all
 *
 * Reversals and reversed entries are both returned. Hiding either would make
 * the ledger look tidy and stop it being an audit trail, which is the point.
 */
ledgerRouter.get('/entries', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    const profileId = await requireProfile(req, res);
    if (!profileId) return;

    const { from, to } = periodRange(queryString(req.query.period) || 'all');
    const filter: Record<string, unknown> = { profileId };
    if (from) filter.date = { $gte: from, $lte: to };

    const docs = await getDb().collection(ENTRIES).find(filter).sort({ date: -1, _id: -1 }).toArray();
    return res.json({ entries: docs.map(({ _id, ...e }) => ({ ...e, id: String(_id) })) });
  } catch (err) {
    console.error('[ledger] GET /entries failed:', err);
    return res.status(500).json({ error: 'entries_read_failed', message: 'Could not load entries.' });
  }
});

/** Local-date period bounds. Empty `from` means no date filter. */
function periodRange(period: string): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const to = iso(now);

  if (period === 'day') return { from: to, to };
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: iso(d), to };
  }
  if (period === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: iso(d), to };
  }
  return { from: '', to };
}

/**
 * GET /api/ledger/summary?period=day|week|month|all
 *
 * Sums are algebraic, so a reversal's negative amount cancels the entry it
 * corrects without either row being hidden or edited.
 */
ledgerRouter.get('/summary', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const period = queryString(req.query.period) || 'month';
  if (!['day', 'week', 'month', 'all'].includes(period)) {
    return res.status(400).json({ error: 'invalid_period', message: 'period must be day, week, month or all.' });
  }

  try {
    const profileId = await requireProfile(req, res);
    if (!profileId) return;

    const { from, to } = periodRange(period);
    const filter: Record<string, unknown> = { profileId };
    if (from) filter.date = { $gte: from, $lte: to };

    const docs = await getDb().collection(ENTRIES).find(filter).toArray();

    let earned = 0;
    let owed = 0;
    let cash = 0;
    let upi = 0;
    let outstanding = 0;

    for (const d of docs) {
      const amt = Number(d.amount) || 0;
      if (d.direction === 'in') {
        earned += amt;
        if (d.paymentType === 'upi') upi += amt;
        else cash += amt;
      } else {
        owed += amt;
        // Receivables (Day 8): money owed that has not been settled. Reversed
        // rows net to zero here rather than being filtered out.
        if (!d.settledAt) outstanding += amt;
      }
    }

    return res.json({
      period,
      from: from || null,
      to,
      earned,
      owed,
      net: earned - owed,
      outstanding,
      byPaymentType: { cash, upi },
      entryCount: docs.length,
    });
  } catch (err) {
    console.error('[ledger] GET /summary failed:', err);
    return res.status(500).json({ error: 'summary_failed', message: 'Could not compute the summary.' });
  }
});

/**
 * POST /api/ledger/entries/:id/reverse
 *
 * Writes a NEW entry that negates the original. The original is never touched -
 * section 4B requires corrections to be reversing entries with a reason rather
 * than in-place edits.
 *
 * The reversal keeps the original's direction and carries a NEGATIVE amount,
 * rather than flipping direction with a positive one. Flipping would file a
 * correction to income as though it were udhaar, corrupting the receivables
 * total that Day 8 reads. A negative amount cancels cleanly in every aggregate.
 *
 * NOTE: the frozen contract has no `reason` field on KamaiEntry, so the reason
 * is carried in `description`. Adding one is a types.ts change and needs all
 * three tracks - raised, not taken.
 */
ledgerRouter.post('/entries/:id/reverse', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  const reason = typeof (req.body ?? {}).reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) {
    return res.status(400).json({ error: 'invalid_field', field: 'reason', message: 'reason is required to reverse an entry.' });
  }

  try {
    await ensureLedgerIndexes();
    const profileId = await requireProfile(req, res);
    if (!profileId) return;

    const db = getDb();
    const original = await db.collection(ENTRIES).findOne({ _id: req.params.id as never, profileId });

    if (!original) {
      return res.status(404).json({ error: 'entry_not_found', message: 'No such entry for this user.' });
    }
    if (original.reversesId) {
      return res.status(409).json({ error: 'cannot_reverse_a_reversal', message: 'That entry is itself a reversal.' });
    }

    const already = await db.collection(ENTRIES).findOne({ profileId, reversesId: req.params.id });
    if (already) {
      const { _id, ...e } = already;
      return res.status(200).json({ entry: { ...e, id: String(_id) }, idempotentReplay: true });
    }

    const id = uuidv7();
    const reversal: Omit<KamaiEntry, 'id'> = {
      profileId,
      direction: original.direction as LedgerDirection,
      syncState: 'synced',
      date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
      amount: -Math.abs(Number(original.amount) || 0),
      description: `Reversal: ${reason} (was: ${String(original.description ?? '').slice(0, 80)})`,
      customerName: original.customerName as string | undefined,
      paymentType: original.paymentType as 'cash' | 'upi',
      jobId: original.jobId as string | undefined,
      category: original.category as string | undefined,
      reversesId: String(original._id),
      createdAt: new Date().toISOString(),
    };

    try {
      await db.collection(ENTRIES).insertOne({ _id: id as never, ...reversal });
    } catch (e) {
      // The unique partial index rejected a concurrent second reversal.
      if ((e as { code?: number }).code === 11000) {
        return res.status(409).json({ error: 'already_reversed', message: 'This entry was reversed concurrently.' });
      }
      throw e;
    }

    return res.status(201).json({ entry: { id, ...reversal }, reversed: String(original._id) });
  } catch (err) {
    console.error('[ledger] reverse failed:', err);
    return res.status(500).json({ error: 'reverse_failed', message: 'Could not reverse the entry.' });
  }
});
