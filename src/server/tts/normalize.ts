import type { SupportedLanguage } from '../../types';

/**
 * Text tidying applied before synthesis AND before hashing.
 *
 * Normalising before hashing is the point: two strings that differ only by a
 * decorative emoji should be one cache entry, not two.
 *
 * The emoji list is carried over verbatim from the browser speakText() this
 * replaced. It is a fixed set rather than a general emoji range because that is
 * what the app actually emits; a broad range risked eating meaningful
 * characters in Gurmukhi and Devanagari.
 */

const DECORATIVE = /👋|🎙️|🔊|✏️|✓|🎉|🇮🇳|🌐|★/g;

/** How "₹500" should be SPOKEN, per language. */
const RUPEES: Record<string, string> = {
  en: 'rupees',
  hi: 'रुपये',
  pa: 'ਰੁਪਏ',
};

/**
 * Indian digit grouping: last three digits, then pairs. 150000 -> "1,50,000".
 *
 * Grouping at all is required, not cosmetic. Sarvam reads a bare 10000
 * digit-by-digit ("one zero zero zero zero") and 10,000 as a whole number; its
 * own docs say so: "For numbers larger than 4 digits, use commas (e.g. '10,000'
 * instead of '10000')".
 *
 * Indian rather than Western grouping because every target language here is
 * Indian and these are rupee amounts - a worker hears "ek lakh pachaas hazaar",
 * not "one hundred fifty thousand". If a provider ever mis-parses this format,
 * this function is the single place to switch it back.
 */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  return head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail;
}

export function normalizeForSpeech(text: string, lang: SupportedLanguage): string {
  const rupees = RUPEES[lang] ?? RUPEES.en;

  return text
    // Currency BEFORE the decorative strip, so the symbol becomes a spoken word
    // rather than being silently deleted along with the emoji.
    .replace(/₹\s*(\d[\d,]*)/g, (_m, amount: string) => `${amount} ${rupees}`)
    .replace(DECORATIVE, '')
    // A bare ₹ with no number attached has nothing to say; drop it.
    .replace(/₹/g, '')
    .replace(/\n+/g, '. ')
    // Only BARE runs of digits. A number that already carries commas is left
    // alone, so re-normalising an already-normalised string is a no-op and the
    // hash stays stable.
    .replace(/\d+/g, (digits) => (digits.length > 4 ? groupIndian(digits) : digits))
    .replace(/\s+/g, ' ')
    .trim();
}
