import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected, getDbErrorCategory } from '../db';
import { resolveOrigin } from '../lib/origin';
import { demoCustomerEnabled } from '../auth/demoCustomer';
import { bookingDemoSlotsEnabled, bookingsEnabled } from '../bookingConfig';

/**
 * health - liveness and dependency state.
 *
 * Not one of the Architecture 5 service boundaries; it is infrastructure.
 * Kept a module rather than left in the bootstrap because it is the
 * verification instrument for P1 (Gemini key loaded) and P2 (Atlas reachable),
 * and it will grow as more dependencies land.
 *
 * Mounted at /api/health, so the public path is unchanged by the split.
 *
 * Owner: Track A.
 */

export const healthRouter = Router();

healthRouter.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    /**
     * The origin the SERVER believes it is reachable at - the same value
     * resolveOrigin() gives the passport QR.
     *
     * Published so the client's Share button can build the identical URL rather
     * than guessing at one. window.location.origin is right in every ordinary
     * case and wrong in exactly the case that matters: when PUBLIC_ORIGIN is set
     * to pin printed QR codes to a chosen domain, a client guessing from its own
     * location would hand out a different link than the QR encodes. One of them
     * would then be wrong on a printed card, and nobody would find out until
     * someone scanned it.
     *
     * Not a disclosure: this is the origin the caller already used to reach here.
     */
    publicOrigin: resolveOrigin(req),
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    hasTtsKey: !!process.env.SARVAM_API_KEY,
    customerDemoEnabled: demoCustomerEnabled(),
    // Whether the worker's slot picker should offer the demo-only "2 minutes"
    // window. A boolean about UI, not a secret - see bookingDemoSlotsEnabled().
    // Whether booking commitments are on, so the customer's request form only
    // offers "urgent" when it changes anything. A boolean, not configuration.
    bookingsEnabled: bookingsEnabled(),
    bookingDemoSlots: bookingDemoSlotsEnabled(),
    db: {
      connected: isDbConnected(),
      // A category, not the driver string. This endpoint is unauthenticated and
      // Mongo errors can leak cluster hostnames. Detail is in the logs.
      error: getDbErrorCategory(),
    },
    appName: 'Kaarigar Saathi',
  });
});
