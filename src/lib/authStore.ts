import type { AuthUser } from '../types';

/**
 * Where the session actually lives.
 *
 * One module owns reading, writing and clearing the token pair, so that
 * authToken.ts (the fetch seam) and AuthProvider (the lifecycle) are two views
 * of the same storage rather than two copies of the same logic.
 *
 * STORAGE CHOICE, STATED PLAINLY. Tokens sit in localStorage, which means
 * script running on this origin can read them. The alternative - refresh token
 * in an httpOnly, SameSite cookie - is genuinely stronger and is the right V1
 * move, but it needs a cookie-issuing path on identity-svc, CSRF handling on
 * every mutation, and it breaks the sync getAuthToken() seam that the app is
 * already built around. The mitigation that matters here is that the app has
 * no third-party scripts and every interpolated value on the public page is
 * escaped, so the XSS that would be needed to reach this does not currently
 * have a way in.
 *
 * The access token is short (15 minutes) precisely so that this exposure has a
 * short tail; the refresh token rotates on every use with reuse detection
 * revoking the family (section 12.1), so a stolen refresh token gets exactly
 * one use before the real holder's next refresh burns the whole family.
 */

const KEY = 'kaarigar_auth_v1';

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms at which accessToken stops being accepted. */
  expiresAt: number;
  user: AuthUser;
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<Session>;
  return (
    typeof s.accessToken === 'string' &&
    typeof s.refreshToken === 'string' &&
    typeof s.expiresAt === 'number' &&
    !!s.user &&
    typeof s.user.uid === 'string'
  );
}

/**
 * The stored session, or null.
 *
 * Every failure mode returns null rather than throwing: private-mode browsers
 * throw on localStorage access, and a half-written or older-shaped value
 * deserialises into something that type-checks and behaves wrong. A user who
 * cannot be read is simply signed out, which is recoverable; an exception here
 * would blank the app at boot, which is not.
 */
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage full or blocked. The in-memory session still works for this tab;
    // the user is asked to sign in again next launch. Failing loudly here would
    // turn a survivable degradation into a broken login.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing useful to do */
  }
}

/**
 * Build a Session from an auth response.
 *
 * expiresAt is computed once, here, from the server's expiresInSeconds. Doing
 * it at each read would drift, and trusting a client clock to know the token
 * lifetime would not survive a device with a wrong date.
 */
export function sessionFrom(
  res: { accessToken: string; refreshToken: string; expiresInSeconds: number },
  user: AuthUser
): Session {
  return {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    expiresAt: Date.now() + res.expiresInSeconds * 1000,
    user,
  };
}

/** True when the access token is within `skewMs` of expiry (default 60s). */
export function isExpiring(session: Session, skewMs = 60_000): boolean {
  return Date.now() >= session.expiresAt - skewMs;
}
