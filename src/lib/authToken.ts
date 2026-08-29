/// <reference types="vite/client" />

/**
 * Where the client gets its bearer token.
 *
 * THIS IS A SEAM, AND IT IS THE ONLY THING THAT SHOULD CHANGE when real auth
 * lands. Replace the body of getAuthToken() with a read from AuthProvider
 * context or storage, delete VITE_DEMO_TOKEN, and every caller - this fetch,
 * and the seven screens migrating to the API - picks it up with no edit.
 *
 * The alternative, reading import.meta.env at each call site, works today and
 * scatters the change across files nobody remembers to find later.
 *
 * ---------------------------------------------------------------------------
 * VITE_DEMO_TOKEN IS A TEMPORARY DEMO AFFORDANCE.
 *
 * /api/assistant/process requires a token, because every successful assistant
 * interaction ends in an owner-scoped write. Until login exists, the demo build
 * carries a token for the seeded demo worker, minted by `npm run demo:token`.
 *
 * It ships in the browser bundle. Anyone who opens devtools on the demo build
 * has a working credential for that account. Acceptable for a rehearsed demo
 * against seed data; not acceptable for anything else. Day 9 should confirm the
 * variable is gone.
 * ---------------------------------------------------------------------------
 */

export function getAuthToken(): string | null {
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : undefined;
  const token = env?.VITE_DEMO_TOKEN;
  return typeof token === 'string' && token ? token : null;
}

/**
 * Spreadable auth header. Returns {} when there is no token, so a request
 * without one produces a clean 401 rather than a malformed Authorization
 * header, which is a much harder failure to read.
 */
export function authHeader(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
