import { Router } from 'express';

/**
 * pricing-svc - rate bands, statutory wage floor.
 *
 * Architecture section 5 Tier 3 service boundary. Empty by design - the split
 * exists so that this file is the only place these routes are ever added, and
 * so that no track has to edit the bootstrap or another track's module.
 *
 * Owner: Track A
 * Lands: Day 7
 * Mounted at: /api/pricing
 *
 * Planned surface (Architecture section 8):
 *   GET /band?trade=&task=&locality=
 *
 * The statutory wage floor is enforced HERE, server-side, not as a UI hint
 * (section 4C design guard). Suppress the band below the minimum sample_n.
 *
 * Reach the database only through getDb() from '../db'. No cross-module direct
 * database reads (section 5.2).
 */

export const pricingRouter = Router();
