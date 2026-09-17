import type { SupportedLanguage } from '../types';

/**
 * How booking times read on screen, shared by the worker's and the customer's
 * views of the same appointment.
 *
 * ONE FORMATTER FOR BOTH SIDES. A kaarigar reading "Thu 18 Sep, 9:00 am -
 * 11:00 am" and a customer reading the same slot in a different shape is how a
 * misunderstanding about when someone is coming starts.
 *
 * Always the device's local time zone. Every instant on the wire is UTC ISO;
 * the person looking at it wants the time on their own wall clock.
 */

const LOCALES: Record<SupportedLanguage, string> = {
  hi: 'hi-IN', pa: 'pa-IN', en: 'en-IN', kn: 'kn-IN', mr: 'mr-IN',
};

function localeFor(language: SupportedLanguage): string {
  return LOCALES[language] ?? 'en-IN';
}

/** A slot as one line: "Thu 18 Sep, 9:00 am - 11:00 am". Empty when there is no start. */
export function formatSlot(
  startIso: string | undefined,
  endIso: string | undefined,
  language: SupportedLanguage
): string {
  if (!startIso) return '';
  const locale = localeFor(language);
  const start = new Date(startIso);
  const day = start.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const from = start.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (!endIso) return `${day}, ${from}`;
  const to = new Date(endIso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${from} - ${to}`;
}

/** A single instant: "Thu 18 Sep, 12:00 pm". Used for deadlines. */
export function formatMoment(iso: string | undefined, language: SupportedLanguage): string {
  return formatSlot(iso, undefined, language);
}
