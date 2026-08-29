import type { Express } from 'express';

import { healthRouter } from './health';
import { assistantRouter } from './assistant';
import { identityRouter } from './identity';
import { passportRouter } from './passport';
import { jobsRouter } from './jobs';
import { ledgerRouter } from './ledger';
import { syncRouter } from './sync';
import { pricingRouter } from './pricing';
import { reputationRouter } from './reputation';
import { publicRouter } from './public';

/**
 * The single mounting table for every route module.
 *
 * All nine boundaries are mounted here from Day 1, including the ones that are
 * still empty. That is deliberate: it means adding an endpoint later touches
 * exactly one file - the module it belongs to - and never this file or the
 * bootstrap. Tracks A and C can work the whole ten days without a structural
 * merge conflict.
 *
 * An empty Router matches nothing, so mounting a stub costs a no-op lookup and
 * changes no behaviour.
 *
 * ORDER IS SIGNIFICANT. Everything here is registered before the Vite dev
 * middleware and before the production SPA catch-all, both of which are added
 * later in server.ts. publicRouter in particular sits at the site root and
 * would be shadowed by the SPA fallback if that ran first.
 */
export function registerRoutes(app: Express): void {
  // Infrastructure
  app.use('/api/health', healthRouter);

  // Tier 3 service boundaries (Architecture section 5)
  app.use('/api/assistant', assistantRouter);   // A - voice processing
  app.use('/api/auth', identityRouter);         // A - identity-svc
  app.use('/api/passport', passportRouter);     // A - passport-svc
  app.use('/api/jobs', jobsRouter);             // A - jobs-svc
  app.use('/api/ledger', ledgerRouter);         // A - ledger-svc
  app.use('/api/sync', syncRouter);             // A - sync-svc
  app.use('/api/pricing', pricingRouter);       // A - pricing-svc
  app.use('/api/reviews', reputationRouter);    // C - reputation-svc

  // Any /api/* path that reached here matched no router above. Answer it
  // honestly with JSON.
  //
  // Without this, an unmatched /api/* request falls through to the SPA handling
  // in server.ts and comes back as 200 with an HTML body. A caller then sees
  // response.ok === true and throws on response.json() - which is precisely the
  // silent failure the audit found at VoiceAssistantModal.tsx:246. The eight
  // empty boundary stubs make that likelier, not less likely: the paths now
  // look real and still answer nothing until their owner implements them.
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: 'not_found',
      message: `No handler for ${req.method} /api${req.path}`,
    });
  });

  // Public SSR surfaces at the site root. Must stay last within this function
  // and, more importantly, ahead of the SPA handling in server.ts.
  app.use('/', publicRouter);                   // C - /p/:handle, /r/:token
}
