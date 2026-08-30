import { loadSession } from './authStore';

/**
 * Where the client gets its bearer token.
 *
 * THIS IS THE SEAM, and it has now done its job. Every caller - the assistant
 * fetch, and the screens migrating to the API - reads the real signed-in
 * session through here with no edit of its own, exactly as designed.
 *
 * ---------------------------------------------------------------------------
 * VITE_DEMO_TOKEN IS GONE.
 *
 * Until login existed, the demo build carried a 12-hour token for the seeded
 * demo worker, minted with `npm run demo:token` and compiled into the browser
 * bundle - a working credential for that account available to anyone who
 * opened devtools. AuthProvider replaced it, so the variable is deleted here,
 * from .env.example, and from render.yaml.
 *
 * If you are reading this because something 401s: the fix is to sign in, not
 * to reintroduce the variable.
 * ---------------------------------------------------------------------------
 *
 * DELIBERATELY SYNCHRONOUS. Callers are fetch call sites that build headers
 * inline, and making this async would force every one of them to change - the
 * opposite of what a seam is for. Keeping the stored token fresh is
 * AuthProvider's job: it refreshes ahead of expiry so that what this returns is
 * almost always valid, and signs the user out when a refresh fails.
 */

export function getAuthToken(): string | null {
  return loadSession()?.accessToken ?? null;
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
