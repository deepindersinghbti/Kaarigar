import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../types';
import {
  clearSession,
  isExpiring,
  loadSession,
  saveSession,
  sessionFrom,
  type Session,
} from '../lib/authStore';

/**
 * The session lifecycle: restore on boot, refresh ahead of expiry, sign out.
 *
 * Owner: Track B.
 *
 * WHY A PROVIDER AND NOT A HOOK PER SCREEN. Refresh must happen exactly once
 * for the app, not once per component that happens to need a token. Two
 * components refreshing concurrently would each present the same refresh token,
 * the second would be seen as a replay, and identity-svc would revoke the whole
 * family (section 12.1) - signing the user out as a direct result of having
 * rendered two screens. The single timer here is what prevents that.
 */

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface OtpChallenge {
  challengeId: string;
  expiresInSeconds: number;
  /** Present only when the server is not in production. Local convenience. */
  devCode?: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  requestOtp: (phone: string) => Promise<OtpChallenge>;
  verifyOtp: (challengeId: string, code: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Throws rather than returning null when used outside the provider. A silent
 * null here would surface as an unexplained signed-out state three components
 * away from the actual mistake.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Read an error message out of a failed response.
 *
 * The API names the offending field on every validation failure, and those
 * messages are written to be shown to a person. Surfacing the server's message
 * beats a generic "something went wrong", which is the failure the audit
 * called out on the client side.
 */
async function errorFrom(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    if (typeof body?.message === 'string') return new Error(body.message);
    if (typeof body?.error === 'string') return new Error(body.error);
  } catch {
    /* not JSON; fall through */
  }
  return new Error(fallback);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  /** Pending refresh timer, so it can be replaced rather than duplicated. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against a refresh landing after sign-out and reviving the session. */
  const alive = useRef(true);

  const applySignOut = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    clearSession();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  /**
   * Rotate the refresh token and reschedule.
   *
   * Any failure signs out. A refresh that fails is either an expired session, a
   * revoked family, or a server that cannot verify the token - and in all three
   * the honest state is "signed out". Retrying a rejected refresh token is how
   * a client turns one expired session into a reuse-detection revocation.
   */
  const refresh = useCallback(
    async (session: Session): Promise<void> => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
        if (!res.ok) {
          applySignOut();
          return;
        }
        const body = await res.json();
        if (!alive.current) return;
        const next = sessionFrom(body, session.user);
        saveSession(next);
        setUser(next.user);
        setStatus('authenticated');
        schedule(next);
      } catch {
        // Network failure, not an auth failure. Keep the session - the token may
        // still be valid and the user may simply be offline, which is the normal
        // state for this user group (section 9). Try again shortly.
        if (!alive.current) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void refresh(session), 30_000);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applySignOut]
  );

  /** Schedule the next refresh for one minute before the access token expires. */
  const schedule = useCallback(
    (session: Session) => {
      if (timer.current) clearTimeout(timer.current);
      const delay = Math.max(5_000, session.expiresAt - Date.now() - 60_000);
      timer.current = setTimeout(() => void refresh(session), delay);
    },
    [refresh]
  );

  // Boot: restore whatever is in storage.
  useEffect(() => {
    alive.current = true;
    const session = loadSession();

    if (!session) {
      setStatus('unauthenticated');
      return;
    }
    if (isExpiring(session)) {
      // Expired or nearly so - prove it still works before showing the app,
      // otherwise the first authenticated screen renders and immediately 401s.
      void refresh(session);
      return;
    }

    setUser(session.user);
    setStatus('authenticated');
    schedule(session);

    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestOtp = useCallback(async (phone: string): Promise<OtpChallenge> => {
    const res = await fetch('/api/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) throw await errorFrom(res, 'Could not send the code. Try again.');
    return (await res.json()) as OtpChallenge;
  }, []);

  const verifyOtp = useCallback(
    async (challengeId: string, code: string): Promise<void> => {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, code }),
      });
      if (!res.ok) throw await errorFrom(res, 'That code did not work.');

      const body = await res.json();
      const session = sessionFrom(body, body.user as AuthUser);
      saveSession(session);
      setUser(session.user);
      setStatus('authenticated');
      schedule(session);
    },
    [schedule]
  );

  return (
    <AuthContext.Provider value={{ status, user, requestOtp, verifyOtp, signOut: applySignOut }}>
      {children}
    </AuthContext.Provider>
  );
}
