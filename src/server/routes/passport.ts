import { Router } from 'express';

/**
 * passport-svc - worker profile, credentials, portfolio.
 *
 * Architecture section 5 Tier 3 service boundary. Empty by design - the split
 * exists so that this file is the only place these routes are ever added, and
 * so that no track has to edit the bootstrap or another track's module.
 *
 * Owner: Track A
 * Lands: Day 3
 * Mounted at: /api/passport
 *
 * Planned surface (Architecture section 8):
 *   GET   /me
 *   PATCH /me
 *
 * Reach the database only through getDb() from '../db'. No cross-module direct
 * database reads (section 5.2).
 */

export const passportRouter = Router();
