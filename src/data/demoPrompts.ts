import type { SupportedLanguage } from '../types';

/**
 * The one-tap demo prompts under "Quick prompts" in the voice assistant.
 *
 * Extracted from VoiceAssistantModal.tsx when server-side TTS landed. Two
 * consumers outside the component now need these strings and neither can
 * import a .tsx file:
 *
 *   - src/server/tts/staticCopy.ts, to decide that a string is app copy rather
 *     than a worker's personal data, and so belongs in the PUBLIC audio cache.
 *   - scripts/seed-tts.ts, to pre-synthesise them before a demo.
 *
 * Keeping them here means all three read one list. A prompt that lived only in
 * the component would quietly miss the cache and cost a provider call on stage.
 *
 * `en` is the structural source of truth: hi and pa are typed `typeof en`, so
 * adding a key here is a compile error until all three have it.
 */

const en = {
  trade: 'I am an electrician.',
  experience: '18 years.',
  skills: 'House wiring, fan installation and switchboard work.',
  allInOne: 'I have been an electrician for 18 years. I do house wiring, fan installation and MCB work.',
  fan: 'Installed a fan in Sector 35. Customer Neha Sharma. Received 1100 rupees.',
  mcb: 'Changed Rajesh Gupta’s MCB in Sector 22 for 1500 rupees.',
  twoJobs: 'Did two jobs today. First one for 1500 and the second for 1200.',
};

const hi: typeof en = {
  trade: 'Main electrician hoon.',
  experience: '18 saal.',
  skills: 'Ghar ki wiring, pankhe lagana aur switchboard ka kaam.',
  allInOne: 'Main pichle 18 saal se electrician ka kaam kar raha hoon. Ghar ki wiring karta hoon, pankhe lagata hoon aur MCB ka kaam bhi karta hoon.',
  fan: 'Sector 35 mein fan lagaya. Customer Neha Sharma. 1100 rupaye mile.',
  mcb: 'Sector 22 mein Rajesh Gupta ka MCB change kiya, 1500 rupaye.',
  twoJobs: 'Aj do kaam kiye. Pehla 1500 ka aur doosra 1200 ka.',
};

const pa: typeof en = {
  trade: 'ਮੈਂ ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ ਹਾਂ।',
  experience: '18 ਸਾਲ।',
  skills: 'ਘਰ ਦੀ ਵਾਇਰਿੰਗ, ਪੱਖੇ ਲਗਾਉਣਾ ਅਤੇ ਸਵਿੱਚਬੋਰਡ ਦਾ ਕੰਮ।',
  allInOne: 'ਮੈਂ ਪਿਛਲੇ 18 ਸਾਲਾਂ ਤੋਂ ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ ਦਾ ਕੰਮ ਕਰ ਰਿਹਾ ਹਾਂ। ਮੈਂ ਘਰ ਦੀ ਵਾਇਰਿੰਗ, ਪੱਖੇ ਅਤੇ MCB ਦਾ ਕੰਮ ਕਰਦਾ ਹਾਂ।',
  fan: 'ਸੈਕਟਰ 35 ਵਿੱਚ ਪੱਖਾ ਲਗਾਇਆ। ਗਾਹਕ ਨੇਹਾ ਸ਼ਰਮਾ। 1100 ਰੁਪਏ ਮਿਲੇ।',
  mcb: 'ਸੈਕਟਰ 22 ਵਿੱਚ ਰਾਜੇਸ਼ ਗੁਪਤਾ ਦਾ MCB ਬਦਲਿਆ, 1500 ਰੁਪਏ।',
  twoJobs: 'ਅੱਜ ਦੋ ਕੰਮ ਕੀਤੇ। ਪਹਿਲਾ 1500 ਦਾ ਅਤੇ ਦੂਜਾ 1200 ਦਾ।',
};

export type DemoPrompts = typeof en;

/**
 * NOTE the fallback arm: kn and mr get HINDI here, not English.
 *
 * That is deliberate and preserves the ternary this replaced. It differs from
 * getVoiceCopy(), which falls back to English for the same two languages - so
 * the two are not interchangeable and this one should not be "made consistent"
 * without checking what a Kannada or Marathi user actually sees.
 */
export const getDemoPrompts = (language: SupportedLanguage): DemoPrompts =>
  language === 'en' ? en : language === 'pa' ? pa : hi;

/** Every demo prompt in every language, for the static-copy set and the seeder. */
export const ALL_DEMO_PROMPTS: ReadonlyArray<{ language: SupportedLanguage; text: string }> =
  ([['en', en], ['hi', hi], ['pa', pa]] as const).flatMap(([language, prompts]) =>
    Object.values(prompts).map((text) => ({ language, text }))
  );
