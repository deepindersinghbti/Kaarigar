import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AuthUser, type Role } from '../auth/tokens';

/**
 * requireAuth / requireRole - the authentication boundary for every protected
 * route.
 *
 * THIS IS THE INTERFACE-PARITY CONTRACT. The plan defers the Firebase-vs-stub
 * decision to end of Day 2 precisely because `req.user` looks identical either
 * way. Today the bearer token is one we signed; if Firebase phone auth starts
 * working, only the verification line inside requireAuth changes - every route,
 * every RBAC check and all of Track B's client code are untouched.
 *
 * Do not let route handlers read the Authorization header directly. If they do,
 * that swap stops being a one-line change.
 *
 * Architecture 12.1: authorisation is enforced here at the service layer, never
 * only in the UI.
 *
 * Owner: Track A.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme ?? '') || !token) return null;
  return token;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) {
    return res.status(401).json({
      error: 'unauthenticated',
      message: 'Missing Authorization: Bearer <token> header.',
    });
  }

  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch (err) {
    const expired = err instanceof Error && err.name === 'TokenExpiredError';
    return res.status(401).json({
      // Distinguished so the client knows to refresh rather than to re-login.
      error: expired ? 'token_expired' : 'invalid_token',
      message: expired
        ? 'Access token expired. Use POST /api/auth/refresh.'
        : 'Access token could not be verified.',
    });
  }
}

/**
 * Object-level checks still belong in the handlers. This gates by role only;
 * 12.1 additionally requires per-object ownership checks on every ledger and
 * passport read, which a role check cannot express.
 */
export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthenticated', message: 'No authenticated user.' });
    }
    if (!req.user.roles.some((r) => allowed.includes(r))) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Requires one of: ${allowed.join(', ')}.`,
      });
    }
    return next();
  };
}
