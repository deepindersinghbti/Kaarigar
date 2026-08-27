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

export interface SpeechListenerOptions {
  language: SupportedLanguage;
  onInterimResult?: (transcript: string) => void;
  onFinalResult: (transcript: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

export class VoiceRecognizer {
  private recognition: any = null;
  private isRunning: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
      }
    }
  }

  start(options: SpeechListenerOptions) {
    if (!this.recognition) {
      if (options.onError) {
        options.onError(new Error('Speech recognition not supported in this browser'));
      }
      return;
    }

    if (this.isRunning) {
      this.stop();
    }

    const locale = LANGUAGE_LOCALE_MAP[options.language] || 'hi-IN';
    this.recognition.lang = locale;

    this.recognition.onstart = () => {
      this.isRunning = true;
      sfx.playListeningStart();
      if (options.onStart) options.onStart();
    };

    this.recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (interim && options.onInterimResult) {
        options.onInterimResult(interim);
      }

      if (final) {
        sfx.playListeningEnd();
        options.onFinalResult(final.trim());
      }
    };

    this.recognition.onerror = (event: any) => {
      this.isRunning = false;
      if (options.onError) options.onError(event);
    };

    this.recognition.onend = () => {
      this.isRunning = false;
      if (options.onEnd) options.onEnd();
    };

    try {
      this.recognition.start();
    } catch (e) {
      console.warn('SpeechRecognition start error:', e);
    }
  }

  stop() {
    if (this.recognition && this.isRunning) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.isRunning = false;
    }
  }
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

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const locale = LANGUAGE_LOCALE_MAP[lang] || 'hi-IN';
    utterance.lang = locale;
    utterance.rate = 0.95; // slightly relaxed conversational pacing
    utterance.pitch = 1.0;

    // Pick best matching voice if available
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(
      (v) => v.lang.startsWith(locale.split('-')[0]) || v.lang === locale
    );
    if (matchingVoice) {
      utterance.voice = matchingVoice;
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
};

export const stopSpeaking = () => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};
