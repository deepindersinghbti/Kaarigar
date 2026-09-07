import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected } from '../db';
import { requireAuth } from '../middleware/auth';
import { createSharedQuote } from '../data/quotes';
import { resolveOrigin } from '../lib/origin';

export const quotesRouter = Router();

function dbGuard(res: Response): boolean {
  if (isDbConnected()) return true;
  res.status(503).json({
    error: 'database_unavailable',
    message: 'Sharing quotes requires the database. Check MONGODB_URI and the Atlas allowlist.',
  });
  return false;
}

/**
 * POST /api/quotes/share
 *
 * The worker is authenticated to create the link. The returned URL is a
 * bearer link: the customer needs no account, while the token is stored only
 * as a SHA-256 hash in MongoDB.
 */
quotesRouter.post('/share', requireAuth, async (req: Request, res: Response) => {
  if (!dbGuard(res)) return;

  try {
    const outcome = await createSharedQuote(req.user!.uid, req.body);
    if (outcome.status === 'rejected') {
      return res.status(400).json({
        error: 'invalid_quote',
        field: outcome.field,
        message: outcome.message,
      });
    }

    return res.status(201).json({
      url: `${resolveOrigin(req)}/q/${outcome.token}`,
      quoteId: outcome.quote.id,
    });
  } catch (err) {
    console.error('[quotes] POST /share failed:', err);
    return res.status(500).json({ error: 'quote_share_failed', message: 'Could not create a share link.' });
  }
});
