import type { SupportedLanguage } from '../../types';

/**
 * tts - the provider seam.
 *
 * Owner: Track A.
 *
 * Punjabi speech used to be synthesised in the browser. Where no pa-IN voice
 * existed - Windows, most Android, all iOS - speakText() transliterated
 * Gurmukhi into Latin and spoke it with an en-IN voice. Punjabi is tonal and an
 * English voice has no tone, no retroflex series and the wrong prosody, so the
 * result was not understandable by a native speaker. That is the failure this
 * package exists to remove, and it is a property of the VOICE MODEL, not of the
 * transliteration dictionary - no amount of vocabulary would have fixed it.
 *
 * Two providers, tried in order, so a single vendor outage does not take voice
 * output down on stage.
 */

export interface TtsAudio {
  audio: Buffer;
  mime: string;
  provider: string;
}

export interface TtsProvider {
  /** Stable identifier, surfaced in the /resolve response as `provider`. */
  name: string;

  /**
   * Whether this provider has the configuration it needs to be attempted.
   *
   * Reads process.env at CALL time, never at module load: the bootstrap runs
   * dotenv.config() before importing routes, but relying on that ordering has
   * bitten this codebase before (see getGenAI in routes/assistant.ts).
   */
  isConfigured(): boolean;

  /** Rejects with a labelled Error on any failure. Never returns empty audio. */
  synthesize(text: string, lang: SupportedLanguage): Promise<TtsAudio>;
}
