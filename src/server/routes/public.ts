import { Router } from 'express';

/**
 * public - server-rendered surfaces that require no login and no app install.
 *
 * Owner: Track C
 * Lands: Day 2 (/p/:handle), Day 3 (/r/:token)
 * Mounted at: / (the site root, NOT under /api)
 *
 * Planned surface (Architecture section 8):
 *   GET /p/:handle   public passport page + printable QR (section 4A, Tier 1)
 *   GET /r/:token    HMAC-signed, job-bound, single-use review link
 *
 * MOUNT ORDER MATTERS. These are the only routes that live at the site root,
 * which puts them in direct competition with the SPA. The bootstrap registers
 * this router BEFORE the Vite dev middleware and BEFORE the production
 * catch-all that serves index.html; mounted after either one, /p/:handle
 * silently returns the React shell instead of the rendered page, and it will
 * look like a routing bug in the app rather than an ordering mistake here.
 *
 * These routes are Express SSR and have no dependency on react-router, so
 * Track C never waits on Track B.
 *
 * The QR must encode the DEPLOYED origin, never localhost - a QR pointing at
 * localhost is useless the moment it leaves the machine that generated it.
 */

export const publicRouter = Router();
