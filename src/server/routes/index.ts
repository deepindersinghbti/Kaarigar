import type { Express } from 'express';

import { healthRouter } from './health';
import { assistantRouter } from './assistant';
import { ttsRouter } from './tts';
import { identityRouter } from './identity';
import { passportRouter } from './passport';
import { jobsRouter } from './jobs';
import { ledgerRouter } from './ledger';
import { syncRouter } from './sync';
import { pricingRouter } from './pricing';
import { reputationRouter } from './reputation';
import { publicRouter } from './public';
import { kaarigarsRouter, customerRouter } from './customer';
import { bookingsRouter } from './bookings';
import { workersRouter } from './workers';
import { requireAuth, requireRole } from '../middleware/auth';

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

  // Enforce actor roles before handlers can read or mutate worker data.
  app.use(['/api/passport', '/api/jobs', '/api/ledger', '/api/sync', '/api/assistant', '/api/quotes'], requireAuth, requireRole('kaarigar'));
  app.use('/api/reviews/link', requireAuth, requireRole('kaarigar'));
  app.use('/api/customer', requireAuth, requireRole('customer'));

  /**
   * DELIBERATE DEVIATION FROM THE RULE ABOVE: requireAuth, but NO requireRole.
   *
   * Every other prefix here belongs to exactly one actor, so one role gate at
   * the mount states the rule once and no handler can forget it. /api/bookings
   * is the first prefix that genuinely serves BOTH - a booking is an
   * appointment between two people, and each of them needs a different subset
   * of it. A mount-level gate could only be the union of both roles, which
   * would gate nothing while looking like it gated something.
   *
   * So the role checks live on each handler in routes/bookings.ts, alongside a
   * PARTICIPATION check that a role gate could never express: being a customer
   * does not entitle you to somebody else's arrival code. If you add a route
   * under this prefix, it inherits authentication and NOTHING ELSE - state its
   * own role and participation rules, or it has none.
   */
  app.use('/api/bookings', requireAuth);

  // Tier 3 service boundaries (Architecture section 5)
  app.use('/api/assistant', assistantRouter);   // A - voice processing
  app.use('/api/tts', ttsRouter);               // A - voice output
  app.use('/api/auth', identityRouter);         // A - identity-svc
  app.use('/api/passport', passportRouter);     // A - passport-svc
  app.use('/api/jobs', jobsRouter);             // A - jobs-svc
  app.use('/api/ledger', ledgerRouter);         // A - ledger-svc
  app.use('/api/sync', syncRouter);             // A - sync-svc
  app.use('/api/pricing', pricingRouter);       // A - pricing-svc
  app.use('/api/reviews', reputationRouter);    // C - reputation-svc

  // The customer side. Two mounts from one module because the paths name
  // resources rather than a role: /api/kaarigars is the directory being
  // browsed, /api/customer is the browser's own stuff.
  app.use('/api/kaarigars', kaarigarsRouter);   // A - customer browse
  app.use('/api/customer', customerRouter);     // A - customer requests

  // Booking commitments and reliability. Both mounted ABOVE the /api JSON 404
  // below, or they would never be reached.
  app.use('/api/bookings', bookingsRouter);     // A - appointments, both roles

  /**
   * UNAUTHENTICATED, like publicRouter and for the same reason: this backs the
   * QR code on a worker's card and the public passport page, and a customer
   * deciding whether to trust someone has no account yet. It publishes counts
   * and ratios only - never a field from PUBLIC_PROJECTION's exclusion list.
   */
  app.use('/api/workers', workersRouter);       // A - public reliability stats

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
