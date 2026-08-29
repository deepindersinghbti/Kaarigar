import { Router } from 'express';

/**
 * reputation-svc - job-anchored reviews, trust score.
 *
 * Architecture section 5 Tier 3 service boundary. Empty by design - the split
 * exists so that this file is the only place these routes are ever added, and
 * so that no track has to edit the bootstrap or another track's module.
 *
 * Owner: Track C
 * Lands: Day 4
 * Mounted at: /api/reviews
 *
 * Planned surface (Architecture section 8):
 *   POST /  (rejected unless the referenced job is COMPLETED)
 *
 * Reach the database only through getDb() from '../db'. No cross-module direct
 * database reads (section 5.2).
 */

export const reputationRouter = Router();
