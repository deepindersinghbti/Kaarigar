/**
 * Query-parameter coercion.
 *
 * Express parses `?trade[$ne]=x` into an OBJECT, and `?trade=a&trade=b` into an
 * ARRAY. Passing either straight into a Mongo filter is how operator injection
 * lands. Today every handler happens to wrap its params in String(), so nothing
 * is exploitable - but that holds by discipline, and discipline decays as
 * params get added.
 *
 * Routing every parameter through here turns the convention into one guard a
 * reviewer can actually check, and makes the omission visible when someone
 * adds a param and forgets.
 *
 * Owner: Track A.
 */

/**
 * A trimmed string, or '' for anything that is not a plain scalar.
 *
 * Objects and arrays collapse to '' rather than to "[object Object]", so an
 * injection attempt reads as a missing parameter instead of as a literal
 * lookup for a nonsense value.
 */
export function queryString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // Arrays (repeated params) and objects (bracket syntax) are rejected, not
  // coerced - neither is ever a legitimate scalar query value here.
  return '';
}

/** Same, but undefined when absent, for optional parameters. */
export function optionalQueryString(value: unknown): string | undefined {
  const s = queryString(value);
  return s === '' ? undefined : s;
}
