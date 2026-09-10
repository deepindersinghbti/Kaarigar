import type { SupportedLanguage } from '../../types';
import type { TtsAudio, TtsProvider } from './provider';

/**
 * Google Cloud Text-to-Speech - tier 2.
 *
 * Exists so a Sarvam outage does not take Punjabi voice output down on stage.
 * Not the primary: Sarvam's bulbul models are trained on Indian languages and
 * read code-mixed Hinglish and Punglish - which is exactly how these workers
 * speak - more naturally than a Wavenet voice does.
 *
 * Owner: Track A.
 */

const ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const TIMEOUT_MS = 8_000;

/**
 * Wavenet voices, one per selectable language. kn and mr are absent on purpose:
 * isLanguageSelectable rejects them upstream, and a silent fallback to some
 * other language's voice would be worse than a clear failure.
 */
const VOICES: Partial<Record<SupportedLanguage, { languageCode: string; name: string }>> = {
  pa: { languageCode: 'pa-IN', name: 'pa-IN-Wavenet-A' },
  hi: { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A' },
  en: { languageCode: 'en-IN', name: 'en-IN-Wavenet-A' },
};

export const googleProvider: TtsProvider = {
  name: 'google',

  // process.env read at call time, never at module load - see provider.ts.
  isConfigured(): boolean {
    return !!process.env.GOOGLE_TTS_API_KEY;
  },

  async synthesize(text: string, lang: SupportedLanguage): Promise<TtsAudio> {
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) throw new Error('[tts:google] GOOGLE_TTS_API_KEY is not set.');

    const voice = VOICES[lang];
    if (!voice) throw new Error(`[tts:google] no voice configured for language "${lang}".`);

    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice,
          audioConfig: { audioEncoding: 'MP3' },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'TimeoutError'
        ? `timed out after ${TIMEOUT_MS}ms`
        : err instanceof Error ? err.message : String(err);
      throw new Error(`[tts:google] request failed: ${reason}`);
    }

    if (!response.ok) {
      // Body is read for the log line only. It can echo the request and key
      // metadata, so it must never reach a client response.
      const detail = await response.text().catch(() => '');
      throw new Error(`[tts:google] HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }

    const body = await response.json().catch(() => null) as { audioContent?: unknown } | null;
    const encoded = typeof body?.audioContent === 'string' ? body.audioContent : null;
    if (!encoded) throw new Error('[tts:google] response contained no audioContent.');

    const audio = Buffer.from(encoded, 'base64');
    if (audio.length === 0) throw new Error('[tts:google] decoded audio was empty.');

    return { audio, mime: 'audio/mpeg', provider: 'google' };
  },
};
