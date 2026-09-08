import { SupportedLanguage } from '../types';

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

const GURMUKHI_PHONETICS: Record<string, string> = {
  'ਅ': 'a', 'ਆ': 'aa', 'ਇ': 'i', 'ਈ': 'ee', 'ਉ': 'u', 'ਊ': 'oo',
  'ਏ': 'e', 'ਐ': 'ai', 'ਓ': 'o', 'ਔ': 'au',
  'ਕ': 'k', 'ਖ': 'kh', 'ਗ': 'g', 'ਘ': 'gh', 'ਙ': 'ng',
  'ਚ': 'ch', 'ਛ': 'chh', 'ਜ': 'j', 'ਝ': 'jh', 'ਞ': 'ny',
  'ਟ': 't', 'ਠ': 'th', 'ਡ': 'd', 'ਢ': 'dh', 'ਣ': 'n',
  'ਤ': 't', 'ਥ': 'th', 'ਦ': 'd', 'ਧ': 'dh', 'ਨ': 'n',
  'ਪ': 'p', 'ਫ': 'ph', 'ਬ': 'b', 'ਭ': 'bh', 'ਮ': 'm',
  'ਯ': 'y', 'ਰ': 'r', 'ਲ': 'l', 'ਵ': 'v', 'ੜ': 'r',
  'ਸ਼': 'sh', 'ਸ': 's', 'ਹ': 'h', 'ਖ਼': 'kh', 'ਗ਼': 'g',
  'ਜ਼': 'z', 'ਫ਼': 'f', 'ਲ਼': 'l',
  'ਾ': 'aa', 'ਿ': 'i', 'ੀ': 'ee', 'ੁ': 'u', 'ੂ': 'oo',
  'ੇ': 'e', 'ੈ': 'ai', 'ੋ': 'o', 'ੌ': 'au',
  'ੰ': 'n', 'ਂ': 'n', 'ੱ': '', '੍': '', '਼': '', 'ੑ': '',
  '੦': '0', '੧': '1', '੨': '2', '੩': '3', '੪': '4',
  '੫': '5', '੬': '6', '੭': '7', '੮': '8', '੯': '9',
  '।': '.',
};

const PUNJABI_SPEECH_WORDS: Record<string, string> = {
  'ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ': 'electrician',
  'ਸਵਿੱਚਬੋਰਡ': 'switchboard',
  'ਪ੍ਰੋਫਾਈਲ': 'profile',
  'ਕਾਰੀਗਰ': 'kaarigar',
  'ਵਾਇਰਿੰਗ': 'wiring',
  'ਲਗਾਉਣਾ': 'lagaauna',
  'ਤਜਰਬਾ': 'tajurba',
  'ਰਮੇਸ਼': 'Ramesh',
  'ਕੁਮਾਰ': 'Kumar',
  'ਆਪਣੀ': 'aapni',
  'ਬਦਲਣਾ': 'badalna',
  'ਦੱਸੋ': 'dasso',
  'ਸਮਝੇ': 'samjhe',
  'ਵੇਰਵੇ': 'verve',
  'ਹੁਨਰ': 'hunar',
  'ਪੱਖਾ': 'pankha',
  'ਐਮਸੀਬੀ': 'MCB',
  'ਸਾਥੀ': 'saathi',
  'ਵਿੱਚ': 'vich',
  'ਅਤੇ': 'ate',
  'ਸਾਲ': 'saal',
  'ਕੰਮ': 'kam',
  'ਘਰ': 'ghar',
  'ਸਭ': 'sabh',
  'ਠੀਕ': 'theek',
  'ਮੈਂ': 'main',
  'ਹਨ': 'han',
  'ਹੈ': 'hai',
  'ਉਹ': 'oh',
  'ਇਹ': 'eh',
  'ਜੀ': 'ji',
  'ਜੋ': 'jo',
  'ਕੀ': 'ki',
  'ਦਾ': 'da',
  'ਦੀ': 'di',
};

export function punjabiSpeechFallback(text: string): string {
  const commonWordsReplaced = Object.entries(PUNJABI_SPEECH_WORDS)
    .sort(([left], [right]) => right.length - left.length)
    .reduce((result, [gurmukhi, phonetic]) => result.replaceAll(gurmukhi, phonetic), text);

  return Array.from(commonWordsReplaced)
    .map((character) => GURMUKHI_PHONETICS[character] ?? character)
    .join('')
    .replace(/[\u0A00-\u0A7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

export const speakText = (
  text: string,
  lang: SupportedLanguage = 'hi',
  onEnd?: () => void
): Promise<void> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      resolve();
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Clean emojis and decorative characters for smoother speech
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
      const matchingVoice = preferredVoice(voices, lang);
      const needsPunjabiFallback = lang === 'pa' && !matchingVoice;
      const spokenText = needsPunjabiFallback ? punjabiSpeechFallback(cleanText) : cleanText;
      const utterance = new SpeechSynthesisUtterance(spokenText);
      const locale = needsPunjabiFallback ? 'en-IN' : LANGUAGE_LOCALE_MAP[lang] || 'hi-IN';
      utterance.lang = locale;
      utterance.rate = 0.95; // slightly relaxed conversational pacing
      utterance.pitch = 1.0;

      // Voices arrive asynchronously in Chrome. Waiting for them is essential
      // for Punjabi/Hindi, otherwise Chrome can pick the first English voice.
      const selectedVoice = matchingVoice
        ?? (needsPunjabiFallback ? preferredVoice(voices, 'en') : undefined);
      if (selectedVoice) utterance.voice = selectedVoice;
      if (needsPunjabiFallback) {
        console.info('[voice]', {
          event: 'punjabi-phonetic-fallback',
          voice: selectedVoice?.name ?? 'browser-default',
        });
      }

      utterance.onend = () => {
        if (onEnd) onEnd();
        resolve();
      };
      utterance.onerror = () => {
        if (onEnd) onEnd();
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  });
};

export const stopSpeaking = () => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};
