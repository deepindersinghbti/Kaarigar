import { Router } from 'express';

/**
 * ledger-svc - append-only earnings, expenses, udhaar.
 *
 * Architecture section 5 Tier 3 service boundary. Empty by design - the split
 * exists so that this file is the only place these routes are ever added, and
 * so that no track has to edit the bootstrap or another track's module.
 *
 * Owner: Track A
 * Lands: Day 4
 * Mounted at: /api/ledger
 *
 * Planned surface (Architecture section 8):
 *   POST /entries              (idempotent on client UUID)
 *   GET  /summary
 *   POST /entries/:id/reverse
 *
 * Reach the database only through getDb() from '../db'. No cross-module direct
 * database reads (section 5.2).
 */

export const ledgerRouter = Router();
