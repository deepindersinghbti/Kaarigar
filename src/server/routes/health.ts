import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDbConnected, getDbErrorCategory } from '../db';

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

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    db: {
      connected: isDbConnected(),
      // A category, not the driver string. This endpoint is unauthenticated and
      // Mongo errors can leak cluster hostnames. Detail is in the logs.
      error: getDbErrorCategory(),
    },
    appName: 'Kaarigar Saathi',
  });
});
