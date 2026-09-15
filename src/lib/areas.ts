/**
 * The tricity areas a passport's free-text location can be resolved to.
 *
 * WHY A TAXONOMY AND NOT COORDINATES. Nothing in this system stores a latitude.
 * WorkerProfile.location is text a worker typed - "Phase 5, Mohali", "Dhakoli,
 * Zirakpur" - and the rate-band data carries no locality either. Matching on
 * that text lets the product say the one true thing it knows, that two people
 * are in the same area, rather than a distance computed from numbers somebody
 * would have had to invent.
 *
 * So this deliberately does NOT rank by proximity between areas. Mohali is
 * nearer Chandigarh than Panchkula is, but encoding that would be the same
 * fabrication in a smaller package. Same area, or not.
 */
export const AREAS = ['Chandigarh', 'Mohali', 'Panchkula', 'Zirakpur'] as const;

export type Area = (typeof AREAS)[number];

/**
 * Tokens that identify each area inside a location string, lowercase.
 *
 * Includes the localities the seeded passports actually sit in, so that
 * "Dhakoli, Zirakpur" resolves on either half, and the official names people
 * write instead of the common one - Mohali is SAS Nagar on paper and nobody
 * says so out loud.
 *
 * Order matters below: the first area with a matching token wins, so a string
 * naming two places resolves to whichever appears in this table first. That is
 * arbitrary, and acceptable only because these areas are adjacent and a
 * location naming two of them is genuinely ambiguous.
 */
const AREA_TOKENS: Record<Area, string[]> = {
  Chandigarh: ['chandigarh', 'chd'],
  Mohali: ['mohali', 'sas nagar', 's.a.s. nagar', 'sahibzada ajit singh nagar', 'kharar'],
  Panchkula: ['panchkula', 'pkl'],
  Zirakpur: ['zirakpur', 'dhakoli', 'baltana'],
};

/**
 * The area a location string names, or null when it names none of them.
 *
 * NULL IS A REAL ANSWER, not a failure to be defaulted away. A worker in Delhi,
 * or one who typed something unparseable, must not be silently filed under
 * Chandigarh - a customer filtering for their own area would then be shown
 * somebody who is nowhere near them, which is worse than showing nothing. The
 * caller decides what an unresolved location means; here it just is not known.
 */
export function areaOf(location: string | undefined | null): Area | null {
  if (!location) return null;
  const haystack = location.toLowerCase();
  for (const area of AREAS) {
    if (AREA_TOKENS[area].some((token) => haystack.includes(token))) return area;
  }
  return null;
}

/** Whether a string is one of the known areas, for validating a query value. */
export function isArea(value: string | undefined | null): value is Area {
  return typeof value === 'string' && (AREAS as readonly string[]).includes(value);
}
