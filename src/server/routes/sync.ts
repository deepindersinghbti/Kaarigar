import { Router } from 'express';

/**
 * sync-svc - offline outbox ingest, idempotency.
 *
 * Architecture section 5 Tier 3 service boundary. Empty by design - the split
 * exists so that this file is the only place these routes are ever added, and
 * so that no track has to edit the bootstrap or another track's module.
 *
 * Owner: Track A
 * Lands: Day 5
 * Mounted at: /api/sync
 *
 * Planned surface (Architecture section 8):
 *   POST /batch  (per-item accept/reject, each with a reason)
 *
 * Reach the database only through getDb() from '../db'. No cross-module direct
 * database reads (section 5.2).
 */

export const syncRouter = Router();
