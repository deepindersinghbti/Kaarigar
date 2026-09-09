import { Router } from 'express';
import type { Request, Response } from 'express';
import type { SupportedLanguage } from '../../types';
import { isLanguageSelectable } from '../../data/translations';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { normalizeForSpeech } from '../tts/normalize';
import { isStaticCopy } from '../tts/staticCopy';
import { signedAudioPath, verifyAudioSignature } from '../tts/signedUrl';
import {
  getCached,
  putCached,
  withInFlight,
  sharedCacheKey,
  privateCacheKey,
  type CacheEntry,
} from '../tts/cache';
import type { TtsProvider } from '../tts/provider';
import { sarvamProvider } from '../tts/sarvam';
import { googleProvider } from '../tts/google';

/**
 * tts - server-side neural speech.
 *
 * Owner: Track A.
 *
 * Replaces browser speechSynthesis for Punjabi. On a device with no pa-IN voice
 * the old client path transliterated Gurmukhi into Latin and read it with an
 * English voice; Punjabi is tonal, so that was not understandable by a native
 * speaker at any dictionary size.
 */

export const ttsRouter = Router();

/**
 * Long enough for any single spoken turn - an assistant reply runs to perhaps
 * 200 characters - and far below bulbul:v3's own 2500 limit. Every character is
 * billed and this endpoint is internet-facing once deployed.
 */
const MAX_TEXT_CHARS = 600;

/**
 * 60/minute. A conversational turn speaks once and prefetches once, so this is
 * roughly 30x real use, while still bounding what an authenticated account can
 * spend on a billed vendor.
 */
const ttsLimit = rateLimit({ name: 'tts', windowMs: 60_000, max: 60 });

/** Tier order. Sarvam first; Google only if Sarvam is unconfigured or fails. */
const PROVIDERS: TtsProvider[] = [sarvamProvider, googleProvider];

const HEX_64 = /^[0-9a-f]{64}$/;

type FailureReason = 'no_provider' | 'all_providers_failed';

// --- POST /api/tts/resolve --------------------------------------------------

ttsRouter.post('/resolve', requireAuth, ttsLimit, async (req: Request, res: Response) => {
  const { text = '', language = 'hi', inline = false } = req.body ?? {};

  if (typeof req.body?.text !== 'string') {
    return res.status(400).json({ error: 'invalid_field', field: 'text', message: 'text must be a string.' });
  }
  if (!req.body.text.trim()) {
    return res.status(400).json({ error: 'invalid_field', field: 'text', message: 'text must not be empty.' });
  }
  if (req.body.text.length > MAX_TEXT_CHARS) {
    return res.status(400).json({
      error: 'input_too_long',
      field: 'text',
      message: `text must be at most ${MAX_TEXT_CHARS} characters.`,
      max: MAX_TEXT_CHARS,
      received: req.body.text.length,
    });
  }
  if (req.body.language !== undefined && typeof req.body.language !== 'string') {
    return res.status(400).json({ error: 'invalid_field', field: 'language', message: 'language must be a string.' });
  }
  if (!isLanguageSelectable(language)) {
    return res.status(400).json({
      error: 'language_unavailable',
      field: 'language',
      message: 'This language is coming soon. Please choose Hindi, Punjabi, or English.',
    });
  }
  if (req.body.inline !== undefined && typeof req.body.inline !== 'boolean') {
    return res.status(400).json({ error: 'invalid_field', field: 'inline', message: 'inline must be a boolean.' });
  }

  const lang = language as SupportedLanguage;
  const uid = req.user!.uid;
  const normalized = normalizeForSpeech(text, lang);
  if (!normalized) {
    return res.status(400).json({
      error: 'invalid_field',
      field: 'text',
      message: 'text contained nothing speakable once decorative characters were removed.',
    });
  }

  /**
   * NAMESPACE IS DECIDED HERE, SERVER-SIDE, AND NEVER TAKEN FROM THE CLIENT.
   *
   * A request is shared-cacheable only if its normalised text is one of the
   * app's own static strings (staticCopy.ts). Everything else - notably an
   * assistant reply carrying a worker's name, a customer's name and an amount -
   * lands in the private namespace, keyed by HMAC and served behind a
   * signature.
   *
   * A client-supplied `cacheable` flag would let a caller push personal data
   * into the public namespace, which is why there isn't one.
   */
  const sharedHash = sharedCacheKey(normalized, lang);
  const isShared = isStaticCopy(sharedHash);
  const hash = isShared ? sharedHash : privateCacheKey(uid, normalized, lang);

  const respond = (entry: CacheEntry, source: 'cache' | 'provider') => {
    if (inline) {
      // Only on the retry path, when a URL already came back 404. Costs the
      // browser cache, so it is never the first answer.
      return res.json({
        audioData: entry.audio.toString('base64'),
        mime: entry.mime,
        hash,
        source,
        provider: entry.provider,
      });
    }
    // The ONLY place an audio URL is constructed. The client plays the string
    // it is handed and never rebuilds one - a reconstructed private URL would
    // carry no signature and be rejected.
    const audioUrl = isShared ? `/api/tts/audio/${hash}` : signedAudioPath(hash, uid);
    return res.json({ audioUrl, hash, source, provider: entry.provider });
  };

  const cached = await getCached(hash);
  if (cached) return respond(cached, 'cache');

  const configured = PROVIDERS.filter((p) => p.isConfigured());
  if (configured.length === 0) {
    console.warn('[tts] no provider configured — set SARVAM_API_KEY or GOOGLE_TTS_API_KEY');
    return res.status(503).json({ error: 'tts_unavailable', reason: 'no_provider' as FailureReason });
  }

  const failures: string[] = [];
  try {
    // withInFlight collapses concurrent misses on the same hash into one
    // provider call - the modal speaks and prefetches at the same time, so this
    // race is routine rather than exotic.
    const entry = await withInFlight(hash, async () => {
      for (const provider of configured) {
        try {
          const audio = await provider.synthesize(normalized, lang);
          const produced: CacheEntry = {
            ...audio,
            namespace: isShared ? 'shared' : 'private',
            ...(isShared ? {} : { ownerId: uid }),
          };
          putCached(hash, produced);
          return produced;
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          console.warn(`[tts] provider ${provider.name} failed: ${detail}`);
          failures.push(detail);
        }
      }
      throw new Error(failures.join(' | ') || 'no provider produced audio');
    });

    return respond(entry, 'provider');
  } catch {
    const detail = failures.join(' | ');
    return res.status(503).json({
      error: 'tts_unavailable',
      reason: 'all_providers_failed' as FailureReason,
      // Provider errors echo request and key metadata, so they are withheld in
      // production. The warnings above always record them server-side.
      ...(process.env.NODE_ENV !== 'production' && detail ? { detail } : {}),
    });
  }
});

// --- GET /api/tts/audio/:hash -----------------------------------------------

/**
 * DELIBERATELY UNAUTHENTICATED. Do not add requireAuth.
 *
 * An <audio src="..."> element cannot send an Authorization header. That is the
 * entire reason this route is public, and the reason private entries are
 * protected by a signed URL instead (tts/signedUrl.ts). Adding auth here would
 * break playback on every device, and the symptom - silence - looks nothing
 * like an auth failure, so it would be debugged for a long time.
 *
 * Shared entries are the app's own copy and carry no personal data. Private
 * entries are verified against the owner recorded on the cached document.
 */
ttsRouter.get('/audio/:hash', async (req: Request, res: Response) => {
  const { hash } = req.params;
  if (!HEX_64.test(hash)) {
    return res.status(400).json({ error: 'invalid_field', field: 'hash', message: 'hash must be 64 hex characters.' });
  }

  const entry = await getCached(hash);
  if (!entry) {
    /**
     * A miss is expected occasionally and is not an error: the entry can be
     * evicted from the LRU, the process can restart, or a second instance can
     * serve this GET, all between /resolve handing out the URL and the browser
     * fetching it. The client answers this by going back through /resolve once
     * with inline: true.
     */
    return res.status(404).json({ error: 'audio_unavailable', hash });
  }

  if (entry.namespace === 'private') {
    if (!entry.ownerId) {
      console.warn(`[tts] private entry ${hash} has no ownerId; refusing to serve`);
      return res.status(403).json({ error: 'forbidden', message: 'This audio cannot be verified.' });
    }
    const verdict = verifyAudioSignature(hash, req.query.e, req.query.s, entry.ownerId);
    if (!verdict.ok) {
      return res.status(403).json({ error: 'forbidden', reason: verdict.reason, message: 'Invalid or expired audio link.' });
    }
  }

  res.set({
    'Content-Type': entry.mime,
    'Content-Length': String(entry.audio.length),
    // Shared copy is immutable: its key is a hash of its own content, so a
    // changed string is a different URL and this can never go stale. Private
    // audio is per-user, so it stays out of shared caches and expires with the
    // signature.
    'Cache-Control': entry.namespace === 'shared'
      ? 'public, max-age=31536000, immutable'
      : 'private, max-age=3600',
  });
  return res.status(200).send(entry.audio);
});
