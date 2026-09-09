import { createHmac } from 'crypto';

/**
 * Key material for the TTS package.
 *
 * Two distinct uses - signing audio URLs, and keying private cache entries -
 * both derive from TTS_URL_SECRET under DIFFERENT labels, so the two keys are
 * unrelated to each other. Compromising one reveals nothing about the other,
 * and neither reveals the secret.
 *
 * Same derive-rather-than-fail-closed stance as lib/reviewToken.ts, for the
 * same reason: requiring a new env var would mean the deploy silently stops
 * producing audio the moment this ships, and a feature that fails closed on a
 * missing variable is one nobody notices is broken until the demo.
 */
export function deriveTtsKey(label: string): Buffer {
  const explicit = process.env.TTS_URL_SECRET;
  const seed = explicit || process.env.JWT_SECRET;
  if (!seed) {
    throw new Error('Neither TTS_URL_SECRET nor JWT_SECRET is set; TTS keys cannot be derived.');
  }
  return createHmac('sha256', seed).update(label).digest();
}
