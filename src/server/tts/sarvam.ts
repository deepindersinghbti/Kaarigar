import type { SupportedLanguage } from '../../types';
import type { TtsAudio, TtsProvider } from './provider';

/**
 * Sarvam bulbul:v3 - tier 1.
 *
 * Chosen over the Google Wavenet fallback because bulbul is trained on Indian
 * languages and reads code-mixed Hinglish and Punglish - which is how these
 * workers actually speak - far more naturally.
 *
 * Owner: Track A.
 *
 * CONTRACT VERIFIED AGAINST THE LIVE API, not just the docs (2026-09-09):
 *   - Response is { request_id, audios: [base64] }. There is no top-level
 *     audio string on any documented or observed response.
 *   - `target_language_code` and `language_code` are BOTH accepted and BOTH
 *     validated: an invalid value returns a 400 naming whichever field was
 *     sent, so each is genuinely parsed rather than one being silently
 *     ignored. They are aliases for the same parameter.
 *
 *     We send `target_language_code` because that is the name Sarvam's own
 *     convert-endpoint and language documentation uses, so code and docs agree
 *     for whoever debugs this next. Switching is a one-line change.
 *   - v3 accepts 2500 characters. routes/tts.ts caps input at 600, well inside.
 *   - `pitch` and `loudness` are bulbul:v2-only and rejected by v3.
 */

const ENDPOINT = 'https://api.sarvam.ai/text-to-speech';
const TIMEOUT_MS = 8_000;
const MODEL = 'bulbul:v3';
const SPEAKER = 'simran';

/**
 * Sarvam's own enum is far wider than this - 23 languages, including kn-IN and
 * mr-IN. It is deliberately narrowed to the three the app actually offers.
 *
 * DO NOT widen it to match Sarvam. isLanguageSelectable gates kn and mr for a
 * reason that has nothing to do with speech: TRANSLATIONS, getScreenCopy and
 * getVoiceCopy have no Kannada or Marathi strings. Adding those codes here
 * would hand those users a fluent voice reading ENGLISH UI copy at them, which
 * is a worse failure than the gate they hit today. The voice is the last piece
 * such a language would need, not the first.
 */
const LANGUAGE_CODES: Partial<Record<SupportedLanguage, string>> = {
  pa: 'pa-IN',
  hi: 'hi-IN',
  en: 'en-IN',
};

export const sarvamProvider: TtsProvider = {
  name: 'sarvam',

  // process.env read at call time, never at module load - see provider.ts.
  isConfigured(): boolean {
    return !!process.env.SARVAM_API_KEY;
  },

  async synthesize(text: string, lang: SupportedLanguage): Promise<TtsAudio> {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) throw new Error('[tts:sarvam] SARVAM_API_KEY is not set.');

    /**
     * Resolved and asserted BEFORE the request, because the endpoint does not
     * fail closed on a missing language: omitting the field entirely still
     * returns 200, synthesised in some default language. Sending Gurmukhi and
     * silently receiving a Hindi or English reading is precisely the bug this
     * whole package exists to remove, so an unmapped language must throw here
     * rather than reach the API without one.
     */
    const languageCode = LANGUAGE_CODES[lang];
    if (!languageCode) throw new Error(`[tts:sarvam] no language code mapped for "${lang}".`);

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'api-subscription-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model: MODEL,
          target_language_code: languageCode,
          speaker: SPEAKER,
          output_audio_codec: 'mp3',
          speech_sample_rate: 22050,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'TimeoutError'
        ? `timed out after ${TIMEOUT_MS}ms`
        : err instanceof Error ? err.message : String(err);
      throw new Error(`[tts:sarvam] request failed: ${reason}`);
    }

    if (!response.ok) {
      // Read for the log line only. Sarvam's 400s are genuinely useful - they
      // name the offending field and list the valid enum - but an error body
      // can echo request metadata, so it must never reach a client response.
      const detail = await response.text().catch(() => '');
      throw new Error(`[tts:sarvam] HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }

    const body = await response.json().catch(() => null) as
      { audios?: unknown; audio?: unknown } | null;

    // audios[0] is the documented and observed shape. The top-level string is
    // a defensive second branch: some doc pages describe one, none of the live
    // responses carried it, and it costs a line to tolerate either.
    const encoded =
      (Array.isArray(body?.audios) && typeof body.audios[0] === 'string' ? body.audios[0] : null)
      ?? (typeof body?.audio === 'string' ? body.audio : null);

    if (!encoded) throw new Error('[tts:sarvam] response contained no audio.');

    const audio = Buffer.from(encoded, 'base64');
    if (audio.length === 0) throw new Error('[tts:sarvam] decoded audio was empty.');

    return { audio, mime: 'audio/mpeg', provider: 'sarvam' };
  },
};
