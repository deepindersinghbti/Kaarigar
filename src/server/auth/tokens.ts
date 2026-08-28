import jwt from 'jsonwebtoken';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';

/**
 * Token issuing and verification for the fallback OTP path.
 *
 * Architecture 12.1: 15-minute access tokens plus rotating refresh tokens with
 * reuse detection. That design is honoured here in full - only OTP *delivery*
 * is stubbed, not the session handling. If Firebase phone auth starts working,
 * the delivery mechanism is swapped and everything below is unaffected.
 *
 * Owner: Track A.
 */

export const ACCESS_TTL_SECONDS = 15 * 60;          // 12.1: 15-minute access token
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

export type Role = 'kaarigar' | 'customer' | 'contractor' | 'verifier' | 'admin';

/**
 * Server-internal for now. `User`, `role` and friends belong in the frozen
 * cross-track contract in src/types.ts, and that file changes only by agreement
 * of all three tracks in the Day 1 session. Raise it there, not here.
 */
export interface AuthUser {
  uid: string;
  phone: string;
  roles: Role[];
}

interface AccessClaims {
  sub: string;
  phone: string;
  roles: Role[];
  typ: 'access';
}

interface RefreshClaims {
  sub: string;
  jti: string;
  family: string;
  typ: 'refresh';
}

/**
 * Fail loudly and at first use rather than signing with a default. A predictable
 * signing key is indistinguishable from no authentication at all.
 *
 * This value must be byte-identical across local and deployed environments, for
 * the same reason the plan calls out for the review-token HMAC secret: tokens
 * signed in one environment silently fail verification in the other, and the
 * symptom looks like a bug in the verification code.
 */
function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or shorter than 32 characters. Generate one with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return s;
}

export function signAccessToken(user: AuthUser): string {
  const claims: AccessClaims = {
    sub: user.uid,
    phone: user.phone,
    roles: user.roles,
    typ: 'access',
  };
  return jwt.sign(claims, secret(), { expiresIn: ACCESS_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, secret()) as AccessClaims;
  if (decoded.typ !== 'access') {
    // A refresh token presented as an access token must not authenticate a
    // request, even though both are validly signed by us.
    throw new Error('not an access token');
  }
  return { uid: decoded.sub, phone: decoded.phone, roles: decoded.roles };
}

/** A new family on login; rotation keeps the family and issues a new jti. */
export function signRefreshToken(uid: string, family: string = randomUUID()) {
  const jti = randomUUID();
  const claims: RefreshClaims = { sub: uid, jti, family, typ: 'refresh' };
  const token = jwt.sign(claims, secret(), { expiresIn: REFRESH_TTL_SECONDS });
  return { token, jti, family };
}

export function verifyRefreshToken(token: string): RefreshClaims {
  const decoded = jwt.verify(token, secret()) as RefreshClaims;
  if (decoded.typ !== 'refresh') throw new Error('not a refresh token');
  return decoded;
}

/**
 * OTP codes are stored hashed. Even a stubbed delivery path should not leave
 * plaintext credentials in the database - the ledger and passport read from the
 * same cluster, and a code that unlocks an account is a credential.
 */
export function hashOtp(code: string, challengeId: string): string {
  return createHmac('sha256', secret()).update(`${challengeId}:${code}`).digest('hex');
}

export function otpMatches(code: string, challengeId: string, expected: string): boolean {
  const actual = Buffer.from(hashOtp(code, challengeId), 'hex');
  const target = Buffer.from(expected, 'hex');
  if (actual.length !== target.length) return false;
  return timingSafeEqual(actual, target);
}
