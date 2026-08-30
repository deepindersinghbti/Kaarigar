import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-signed, job-bound review links.
 *
 * Owner: Track C.
 *
 * WHAT THIS TOKEN IS FOR. Section 8 says a review is "rejected unless the job
 * is COMPLETED and the author is its customer". We have no customer accounts -
 * the locked scope authenticates two roles and a customer is not one of them,
 * because customers reach the worker through a QR rather than by signing up.
 *
 * So possession of this token IS the authorisation, and that substitution
 * should be stated openly rather than glossed: the worker hands the link to the
 * person who just paid them, and holding it stands in for being that person.
 * What the token still guarantees is everything section 4D actually needs to
 * block fake reviews at scale - the review is bound to ONE existing job, cannot
 * be pointed at a different job, cannot be minted by anyone without the server
 * key, and cannot be used twice. An attacker cannot review a worker they never
 * hired, which is the attack that matters.
 *
 * Format: <jobId>.<expiryEpochSeconds>.<base64url HMAC-SHA256>
 * Job ids are UUIDv7 and expiry is digits, so neither needs encoding.
 */

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const LABEL = 'kaarigar/review-link/v1';

/**
 * The signing key.
 *
 * REVIEW_LINK_SECRET when set - the migration plan's P3 anticipates a distinct
 * secret and a distinct secret is better, because a review link and a session
 * token should not share a compromise.
 *
 * Otherwise a key is DERIVED from JWT_SECRET under a fixed label rather than
 * using JWT_SECRET directly. Deriving means the two keys are unrelated even
 * though one seeds the other, so a leaked review link tells an attacker nothing
 * about the token-signing key. Falling back at all is deliberate: requiring a
 * new secret would mean the deploy silently stops issuing review links the
 * moment this ships, and a feature that fails closed on a missing env var is
 * one nobody notices is broken until the demo.
 */
function signingKey(): Buffer {
  const explicit = process.env.REVIEW_LINK_SECRET;
  if (explicit) return Buffer.from(explicit, 'utf8');

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('Neither REVIEW_LINK_SECRET nor JWT_SECRET is set; review links cannot be signed.');
  }
  return createHmac('sha256', jwtSecret).update(LABEL).digest();
}

function sign(jobId: string, exp: number): string {
  return createHmac('sha256', signingKey()).update(`${jobId}.${exp}`).digest('base64url');
}

export function mintReviewToken(jobId: string, ttlSeconds = TOKEN_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${jobId}.${exp}.${sign(jobId, exp)}`;
}

export type TokenResult =
  | { ok: true; jobId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/**
 * Verify a token and recover the job it is bound to.
 *
 * The signature is compared with timingSafeEqual. A plain === leaks how many
 * leading bytes matched through response timing, which over enough requests
 * lets an attacker forge a signature one byte at a time - the whole reason this
 * primitive exists.
 *
 * Expiry is checked AFTER the signature, so an unsigned guess cannot learn
 * whether a job id is real by watching which error comes back.
 */
export function verifyReviewToken(token: string): TokenResult {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const [jobId, expRaw, providedSig] = parts;
  const exp = Number(expRaw);
  if (!jobId || !Number.isInteger(exp)) return { ok: false, reason: 'malformed' };

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = Buffer.from(sign(jobId, exp), 'base64url');
    provided = Buffer.from(providedSig, 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, reason: 'bad_signature' };
  }
  if (Math.floor(Date.now() / 1000) > exp) return { ok: false, reason: 'expired' };

  return { ok: true, jobId };
}
