/**
 * One <audio> element, blessed by the first real user gesture.
 *
 * WHY THIS EXISTS. Mobile Safari and Chrome refuse to play audio that was not
 * started from inside a user gesture. An element that HAS been played during a
 * gesture stays playable afterwards, so the app keeps exactly one and reuses it
 * for every utterance. `new Audio()` per utterance would produce a fresh,
 * unblessed element every time and every play() would reject on a phone.
 *
 * The rejection is silent - no error dialog, no console warning in some
 * builds - and the symptom is simply that Punjabi never speaks. That is the
 * failure mode this module exists to prevent, and it cannot be reproduced on
 * desktop Chrome, which does not enforce the gesture requirement at all.
 */

/**
 * A 50 ms silent mono PCM WAV. Built from the WAV spec rather than copied from
 * a snippet: a hand-pasted MP3 blob cannot be verified by reading it, and a
 * source the browser fails to decode unlocks nothing.
 */
const SILENCE =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

let element: HTMLAudioElement | null = null;
let unlocked = false;

function ensureElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!element) {
    element = new Audio();
    element.preload = 'auto';
  }
  return element;
}

/**
 * Install the one-shot gesture listener. Call ONCE, as early in the app's life
 * as possible - see App.tsx.
 *
 * The listener is registered in the CAPTURE phase, which is load-bearing: it
 * runs before React's own delegated handler for the same tap, so the unlock
 * happens even if a component's handler calls stopPropagation(). In the bubble
 * phase a single stopPropagation anywhere in the tree would leave audio locked
 * for the whole session.
 *
 * Registering this when the voice modal mounts would be too late on iOS - the
 * tap that OPENED the modal is already spent by then, the element is never
 * blessed, and every later play() rejects.
 */
export function installAudioUnlock(): () => void {
  if (typeof window === 'undefined') return () => {};

  const unlock = () => {
    if (unlocked) return;
    const audio = ensureElement();
    if (!audio) return;
    try {
      audio.src = SILENCE;
      const played = audio.play();
      // play() returns a promise in every browser that enforces the gesture
      // rule. Resolve or reject, the element has now been played inside a
      // gesture, which is the only thing that matters.
      if (played && typeof played.then === 'function') {
        played.then(() => {
          audio.pause();
          audio.currentTime = 0;
        }).catch(() => { /* still counts as the attempt */ });
      } else {
        audio.pause();
        audio.currentTime = 0;
      }
      unlocked = true;
    } catch {
      // A locked element is not a reason to break the tap that triggered this.
    }
    teardown();
  };

  const opts = { capture: true } as const;
  const teardown = () => {
    window.removeEventListener('touchstart', unlock, opts);
    window.removeEventListener('click', unlock, opts);
  };

  // Both events, because a tap on iOS fires touchstart first while a desktop
  // or stylus interaction may only produce click. Whichever lands first tears
  // down the other, so this runs exactly once.
  window.addEventListener('touchstart', unlock, opts);
  window.addEventListener('click', unlock, opts);

  return teardown;
}

/**
 * The shared element. Returns null where there is no Audio constructor (SSR,
 * or the hand-rolled `window` stub in scripts/test-voice.ts).
 *
 * May legitimately be un-unlocked: the very first utterance can fire before any
 * tap on a desktop autoplay-permitting browser. Callers must therefore treat a
 * play() rejection as an ordinary outcome, not an exception.
 */
export function getUnlockedAudio(): HTMLAudioElement | null {
  return ensureElement();
}

/** Whether a gesture has blessed the element yet. Diagnostics only. */
export function isAudioUnlocked(): boolean {
  return unlocked;
}
