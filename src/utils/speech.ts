import { SupportedLanguage } from '../types';
import { authHeader } from '../lib/authToken';
import { getUnlockedAudio } from './audioUnlock';

export const LANGUAGE_LOCALE_MAP: Record<SupportedLanguage, string> = {
  hi: 'hi-IN',
  pa: 'pa-IN',
  kn: 'kn-IN',
  mr: 'mr-IN',
  en: 'en-IN',
};

// Check Web Speech Recognition support
export const isSpeechRecognitionSupported = (): boolean => {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
};

// Web Audio sound effects synthesizer for tactile audio cues
class SoundEffects {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  playListeningStart() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // ignore
    }
  }

  playListeningEnd() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // ignore
    }
  }

  playSuccessChime() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.2, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.25);
      });
    } catch {
      // ignore
    }
  }
}

export const sfx = new SoundEffects();

function preferredVoice(voices: SpeechSynthesisVoice[], language: SupportedLanguage): SpeechSynthesisVoice | undefined {
  const locale = LANGUAGE_LOCALE_MAP[language] || 'hi-IN';
  const normalizedLocale = locale.toLowerCase().replace('_', '-');
  const normalizedLanguage = normalizedLocale.split('-')[0];

  if (language === 'en') {
    // Browsers often return an en-US voice first even when utterance.lang is
    // en-IN. Prefer an exact Indian English voice, then common Windows/Chrome
    // Indian voice names, before accepting another English accent.
    return voices.find((voice) => voice.lang.toLowerCase().replace('_', '-') === 'en-in')
      ?? voices.find((voice) =>
        voice.lang.toLowerCase().startsWith('en')
        && /india|indian|neerja|ravi|heera|prabhat/i.test(voice.name)
      )
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('en-'))
      ?? voices.find((voice) => voice.lang.toLowerCase() === 'en');
  }

  return voices.find((voice) => voice.lang.toLowerCase().replace('_', '-') === normalizedLocale)
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(`${normalizedLanguage}-`))
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(normalizedLanguage));
}

function availableVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);

  return new Promise((resolve) => {
    const finish = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
    window.setTimeout(finish, 750);
  });
}

export type SpeechStatus = 'starting' | 'listening' | 'finishing' | 'idle';
export interface SpeechListenerOptions {
  language: SupportedLanguage;
  onInterimResult?: (transcript: string) => void;
  onFinalResult: (transcript: string) => void;
  onStatus?: (status: SpeechStatus) => void;
  onComplete?: () => void;
  onError?: (err: { error: string }) => void;
}

// Each hold owns its own engine and callbacks. Late events from cancelled
// holds must never submit data or change the next hold's state.
export class VoiceRecognizer {
  private cancelSession: (() => void) | null = null;
  private releaseSession: (() => void) | null = null;

  start(options: SpeechListenerOptions) {
    this.cancel();
    const Recognition = typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
    if (!Recognition) {
      options.onError?.({ error: 'unsupported' });
      return;
    }
    let engine: any = null;
    let held = true;
    let done = false;
    let running = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = () => {
      clearTimeout(watchdog);
    };
    const detach = () => {
      if (!engine) return;
      engine.onstart = engine.onresult = engine.onerror = engine.onend = null;
    };
    const end = (error?: string, cancelled = false) => {
      if (done) return;
      done = true;
      held = false;
      clearTimers();
      detach();
      try { engine?.abort(); } catch { /* already stopped */ }
      this.cancelSession = this.releaseSession = null;
      options.onStatus?.('idle');
      if (error) options.onError?.({ error });
      else if (!cancelled) options.onComplete?.();
    };
    const armWatchdog = (error: string) => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => end(error), 10000);
    };
    const stopEngine = () => {
      try { engine.stop(); }
      catch { end('stop-failed'); }
    };
    const begin = () => {
      if (done || !held) return;
      detach();
      try {
        engine = new Recognition();
        engine.continuous = true;
        engine.interimResults = true;
        engine.maxAlternatives = 1;
        engine.lang = LANGUAGE_LOCALE_MAP[options.language];
        running = true; // Includes permission/start pending, so release is safe.
        options.onStatus?.('starting');
        armWatchdog('start-timeout');
        const seen = new Set<number>();
        engine.onstart = () => {
          if (done) return;
          clearTimeout(watchdog);
          if (held) options.onStatus?.('listening');
          else {
            armWatchdog('finish-timeout');
            stopEngine();
          }
        };
        engine.onresult = (event: any) => {
          if (done) return;
          let interim = '';
          let final = '';
          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              if (!seen.has(i)) {
                seen.add(i);
                final += result[0].transcript + ' ';
              }
            } else interim += result[0].transcript + ' ';
          }
          if (final.trim()) {
            options.onFinalResult(final.trim());
          }
          options.onInterimResult?.(interim.trim());
        };
        engine.onerror = (event: any) => {
          if (done) return;
          const error = event.error || 'unknown';
          // Diagnostics contain event codes only, never recordings/transcripts.
          console.warn('[voice]', { event: 'recognition-error', error, held });
          end(error);
        };
        engine.onend = () => {
          if (done) return;
          running = false;
          clearTimeout(watchdog);
          end(held ? 'interrupted' : undefined);
        };
        engine.start();
      } catch (error) {
        const name = error instanceof Error ? error.name : 'unknown';
        end(name === 'NotAllowedError' ? 'not-allowed' : 'start-failed');
      }
    };
    this.cancelSession = () => end(undefined, true);
    this.releaseSession = () => {
      if (done || !held) return;
      held = false;
      options.onStatus?.('finishing');
      if (!running) { end(); return; }
      // Wait for final results followed by onend. A timeout reports failure;
      // it must never silently submit an incomplete transcript.
      armWatchdog('finish-timeout');
      stopEngine();
    };
    begin();
  }

  stop() { this.releaseSession?.(); }
  cancel() { this.cancelSession?.(); }
}

/**
 * The browser's own speechSynthesis path, carried over unchanged from before
 * server-side TTS - minus the Punjabi transliteration, which is the entire
 * reason that work happened.
 *
 * Still the right answer for Hindi and English: essentially every device has a
 * usable hi-IN or en-IN voice, it costs nothing per utterance, and it works
 * with no network. It is NEVER used for Punjabi, where the absence of a pa-IN
 * voice is the norm rather than the exception.
 */
function browserSpeak(text: string, lang: SupportedLanguage, onEnd?: () => void): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const cleanText = text
      .replace(/👋|🎙️|🔊|✏️|✓|🎉|🇮🇳|🌐|★|₹/g, '')
      .replace(/\n+/g, '. ')
      .trim();

    if (!cleanText) {
      if (onEnd) onEnd();
      resolve();
      return;
    }

    void availableVoices().then((voices) => {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = LANGUAGE_LOCALE_MAP[lang] || 'hi-IN';
      utterance.rate = 0.95; // slightly relaxed conversational pacing
      utterance.pitch = 1.0;

      // Voices arrive asynchronously in Chrome. Waiting for them still matters
      // for Hindi, otherwise Chrome can pick the first English voice.
      const selectedVoice = preferredVoice(voices, lang);
      if (selectedVoice) utterance.voice = selectedVoice;

      utterance.onend = () => { if (onEnd) onEnd(); resolve(); };
      utterance.onerror = () => { if (onEnd) onEnd(); resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  });
}

interface TtsResolveResponse {
  audioUrl?: string;
  audioData?: string;
  mime?: string;
}

/**
 * Ask the server for audio.
 *
 * The returned URL is used VERBATIM and never rebuilt on the client: private
 * audio is signed and bound to the signed-in user, so a hand-constructed
 * /api/tts/audio/<hash> would carry no signature and be refused. /resolve is
 * the only place a playable URL comes from - including on the retry below.
 */
async function resolveTts(
  text: string,
  lang: SupportedLanguage,
  inline: boolean
): Promise<string | null> {
  const response = await fetch('/api/tts/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ text, language: lang, ...(inline ? { inline: true } : {}) }),
  });
  if (!response.ok) return null;

  const data = await response.json() as TtsResolveResponse;
  if (inline) {
    return data.audioData ? `data:${data.mime || 'audio/mpeg'};base64,${data.audioData}` : null;
  }
  return data.audioUrl ?? null;
}

/**
 * Warm the server-side cache for something the user is about to hear.
 *
 * Fire and forget, and silent on every failure: this is an optimisation, and a
 * failed prefetch must never surface to someone mid-conversation. The real
 * speakText call that follows will simply synthesise as normal.
 *
 * Concurrent with the utterance that triggered it, which is exactly the
 * collision routes/tts.ts de-duplicates - so warming a string that is already
 * being synthesised costs one cache lookup, not a second provider call.
 */
export function prefetchSpeech(text: string, lang: SupportedLanguage): void {
  if (!text || !text.trim()) return;
  void fetch('/api/tts/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ text, language: lang }),
  }).catch(() => { /* deliberately silent */ });
}

type PlaybackOutcome = 'ended' | 'failed' | 'cancelled';

/**
 * Settles the in-flight playback when stopSpeaking() interrupts it.
 *
 * Without this, pausing the element would leave the promise below pending
 * forever: pause() fires no 'ended' event, so the caller's onEnd would never
 * run and the modal's isSpeaking flag would stay true after the modal closed.
 */
let cancelPlayback: (() => void) | null = null;

function playOnce(audio: HTMLAudioElement, src: string): Promise<PlaybackOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: PlaybackOutcome) => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      cancelPlayback = null;
      resolve(outcome);
    };

    cancelPlayback = () => finish('cancelled');
    audio.onended = () => finish('ended');
    audio.onerror = () => finish('failed');

    audio.src = src;
    const started = audio.play();
    // A rejected play() is an ordinary outcome, not an exception: an element
    // that no gesture has blessed yet refuses on mobile. Treated as a failure
    // so the caller can fall back rather than hang.
    if (started && typeof started.catch === 'function') {
      started.catch(() => finish('failed'));
    }
  });
}

/**
 * Speak text, preferring server-side neural audio.
 *
 * The signature is unchanged apart from an OPTIONAL fourth argument, so all
 * existing call sites keep working untouched.
 *
 * Order of attempts:
 *   1. POST /api/tts/resolve, then play the URL it returns.
 *   2. If that URL fails to play - evicted from the cache, process restarted,
 *      or served by another instance - resolve ONCE more with inline: true and
 *      play the audio as a data URL. Exactly one retry: a resolve -> 404 ->
 *      resolve loop would hammer the provider if something is structurally
 *      broken.
 *   3. On total failure, Hindi and English fall back to the browser voice.
 *      PUNJABI DELIBERATELY STAYS SILENT and calls onFailure instead. Silence
 *      plus the on-screen message beats an English voice reading Gurmukhi,
 *      which is the exact failure this whole change exists to remove.
 *
 * The promise always settles and onEnd always runs exactly once, on every
 * path, matching the previous behaviour that callers depend on.
 */
export const speakText = (
  text: string,
  lang: SupportedLanguage = 'hi',
  onEnd?: () => void,
  onFailure?: () => void
): Promise<void> => {
  stopSpeaking();

  return new Promise<void>((resolve) => {
    if (!text || !text.trim()) {
      if (onEnd) onEnd();
      resolve();
      return;
    }

    void (async () => {
      const audio = getUnlockedAudio();

      if (audio) {
        try {
          const url = await resolveTts(text, lang, false);
          if (url) {
            const outcome = await playOnce(audio, url);
            // 'cancelled' means stopSpeaking() ran. Honour it: do not retry and
            // do not fall back, or closing the modal would start a new voice.
            if (outcome === 'ended' || outcome === 'cancelled') {
              if (onEnd) onEnd();
              resolve();
              return;
            }

            const inlineUrl = await resolveTts(text, lang, true);
            if (inlineUrl) {
              const retry = await playOnce(audio, inlineUrl);
              if (retry === 'ended' || retry === 'cancelled') {
                if (onEnd) onEnd();
                resolve();
                return;
              }
            }
          }
        } catch {
          // Network down, signed out, server 503 - all handled below.
        }
      }

      if (lang === 'pa') {
        if (onFailure) onFailure();
        if (onEnd) onEnd();
        resolve();
        return;
      }

      await browserSpeak(text, lang, onEnd);
      resolve();
    })();
  });
};

/**
 * Stop whatever is currently speaking.
 *
 * Must silence BOTH paths. The modal's teardown and its close branch call this,
 * and before server-side audio existed only speechSynthesis.cancel() was
 * needed - an element left playing would keep talking over a closed modal.
 */
export const stopSpeaking = () => {
  if (typeof window === 'undefined') return;

  const audio = getUnlockedAudio();
  if (audio) {
    audio.pause();
    // Settle any pending playback first, so its caller's onEnd runs and the
    // modal's isSpeaking flag clears.
    if (cancelPlayback) cancelPlayback();
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};
