import { createHmac, timingSafeEqual } from 'crypto';
import { deriveTtsKey } from './secret';

/**
 * Signed URLs for PRIVATE cached audio.
 *
 * Owner: Track A. Deliberately shaped like lib/reviewToken.ts - same key
 * derivation, same timing-safe compare, same signature-before-expiry ordering.
 * If you are changing one, read the other.
 *
 * WHY A SIGNED URL RATHER THAN requireAuth. An <audio src="..."> element cannot
 * send an Authorization header. That is the whole reason GET /api/tts/audio is
 * unauthenticated, and the reason the protection had to move into the URL
 * itself. Adding requireAuth to that route "for safety" would break every
 * playback on every device and the symptom - silence - looks nothing like an
 * auth error.
 *
 * WHAT IT PROTECTS. Assistant replies are templated and carry a worker's name,
 * a customer's name and an amount. Cached under a plain sha256 of their text
 * they would form a confirmation oracle: anyone who knows the template could
 * enumerate name/amount tuples and watch which hashes return 200. Private
 * entries are therefore keyed by HMAC (see cache.ts) so the key cannot be
 * derived from the text at all, and served only against a signature that binds
 * the URL to one owner for one hour.
 *
 * The owner id is NOT in the URL. It comes from the cached document, and the
 * signature is recomputed against it - so a URL cannot be re-pointed at another
 * user's row.
 */

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * The URL-signing key, derived under this module's own label. See secret.ts for
 * why it is derived rather than required, and why the cache-keying key uses a
 * different label.
 *
 * Rotating the seed invalidates outstanding signatures, but these expire in an
 * hour anyway - so unlike review links there is nothing here worth preserving.
 */
const LABEL = 'kaarigar/tts-url/v1';

function sign(hash: string, exp: number, ownerId: string): string {
  return createHmac('sha256', deriveTtsKey(LABEL)).update(`${hash}.${exp}.${ownerId}`).digest('base64url');
}

/**
 * The audio path for a private entry, signed for one owner.
 *
 * This function and its shared-namespace counterpart in routes/tts.ts are the
 * ONLY places an audio URL is constructed. The client never builds or rebuilds
 * one - it plays the string it was handed, and on a miss goes back through
 * /api/tts/resolve for a freshly signed one.
 */
export function signedAudioPath(hash: string, ownerId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(hash, exp, ownerId);
  return `/api/tts/audio/${hash}?e=${exp}&s=${encodeURIComponent(sig)}`;
}

export type SignatureResult =
  | { ok: true }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/**
 * Verify a signature against the owner recorded on the cached document.
 *
 * Signature is checked BEFORE expiry, matching reviewToken.ts: an unsigned
 * guess must not be able to learn whether a hash is real by watching which
 * error comes back. Compared with timingSafeEqual because a plain === leaks how
 * many leading bytes matched through response timing.
 */
export function verifyAudioSignature(
  hash: string,
  expRaw: unknown,
  providedSig: unknown,
  ownerId: string
): SignatureResult {
  if (typeof expRaw !== 'string' || typeof providedSig !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  const exp = Number(expRaw);
  if (!Number.isInteger(exp)) return { ok: false, reason: 'malformed' };

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = Buffer.from(sign(hash, exp, ownerId), 'base64url');
    provided = Buffer.from(providedSig, 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, reason: 'bad_signature' };
  }
  if (Math.floor(Date.now() / 1000) > exp) return { ok: false, reason: 'expired' };

  return { ok: true };
}
