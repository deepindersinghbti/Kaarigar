import { Router } from 'express';

/**
 * jobs-svc - job lifecycle state machine (8 states).
 *
 * Architecture section 5 Tier 3 service boundary. Empty by design - the split
 * exists so that this file is the only place these routes are ever added, and
 * so that no track has to edit the bootstrap or another track's module.
 *
 * Owner: Track A
 * Lands: Day 3
 * Mounted at: /api/jobs
 *
 * Planned surface (Architecture section 8):
 *   GET  /
 *   POST /
 *   POST /:id/transition
 *
 * Reach the database only through getDb() from '../db'. No cross-module direct
 * database reads (section 5.2).
 */

export const jobsRouter = Router();
