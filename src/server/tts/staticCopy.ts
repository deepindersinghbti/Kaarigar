import type { SupportedLanguage } from '../../types';
import { TRANSLATIONS, SELECTABLE_LANGUAGE_CODES } from '../../data/translations';
import { getScreenCopy } from '../../data/uiCopy';
import { getVoiceCopy } from '../../data/voiceCopy';
import { ALL_DEMO_PROMPTS } from '../../data/demoPrompts';
import { normalizeForSpeech } from './normalize';
import { sharedCacheKey } from './cache';

/**
 * Every string that is APP COPY rather than somebody's data.
 *
 * Two consumers, and they must not drift apart:
 *
 *   - routes/tts.ts asks isStaticCopy() to decide whether a request belongs in
 *     the public shared cache or the private per-user one. Getting this wrong
 *     in the permissive direction would publish a worker's name and earnings
 *     under a guessable key.
 *   - scripts/seed-tts.ts walks collectStaticStrings() to pre-synthesise them.
 *
 * Both are built from ONE walker below. Two hand-maintained lists would
 * eventually disagree, and the failure would be silent: the seeder would warm
 * hashes the server never asks for, and the demo would pay for every line of
 * copy live on stage.
 *
 * FUNCTION-VALUED COPY IS DELIBERATELY EXCLUDED. Entries like
 * onboardingQuestions.welcome(name) or kamaiQuestions.confirm(total) interpolate
 * a person or an amount, so their output is by definition not shared copy. The
 * walker skips them, which routes them to the private namespace automatically -
 * that is the safe default, and it is what makes "is this PII?" a structural
 * question rather than a judgement call someone has to remember to make.
 */

export interface StaticString {
  language: SupportedLanguage;
  text: string;
}

/**
 * Depth-first over strings, arrays and plain objects. Functions, numbers,
 * null and undefined are skipped.
 *
 * The depth cap is a guard against a future cyclic or pathologically nested
 * copy structure taking the process down at import time; the real trees here
 * are three or four levels deep.
 */
function walk(value: unknown, out: string[], depth = 0): void {
  if (depth > 8) return;
  if (typeof value === 'string') {
    if (value.trim()) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) walk(item, out, depth + 1);
  }
}

let cachedStrings: StaticString[] | null = null;

/** Every static string in every selectable language. Memoised; order is stable. */
export function collectStaticStrings(): StaticString[] {
  if (cachedStrings) return cachedStrings;

  const collected: StaticString[] = [];
  const seen = new Set<string>();

  const add = (language: SupportedLanguage, text: string) => {
    const key = `${language}::${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    collected.push({ language, text });
  };

  for (const language of SELECTABLE_LANGUAGE_CODES) {
    const strings: string[] = [];
    walk(TRANSLATIONS[language], strings);
    walk(getScreenCopy(language), strings);
    walk(getVoiceCopy(language), strings);
    for (const text of strings) add(language, text);
  }

  // Demo prompts carry their own language, so they are not walked per-language.
  for (const { language, text } of ALL_DEMO_PROMPTS) add(language, text);

  cachedStrings = collected;
  return collected;
}

let cachedHashes: Set<string> | null = null;

/**
 * Whether a shared-namespace hash corresponds to known app copy.
 *
 * Takes the HASH rather than the text so the caller normalises and hashes
 * exactly once, and so this comparison cannot accidentally be made against a
 * differently-normalised string.
 */
export function isStaticCopy(sharedHash: string): boolean {
  if (!cachedHashes) {
    cachedHashes = new Set(
      collectStaticStrings()
        .map(({ language, text }) => {
          const normalized = normalizeForSpeech(text, language);
          return normalized ? sharedCacheKey(normalized, language) : null;
        })
        .filter((hash): hash is string => hash !== null)
    );
  }
  return cachedHashes.has(sharedHash);
}

/** Test seam. */
export function __resetStaticCopy(): void {
  cachedStrings = null;
  cachedHashes = null;
}
