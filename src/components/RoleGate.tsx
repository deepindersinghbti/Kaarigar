import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Hammer, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { api, ApiError } from '../lib/api';

/**
 * Decides, once, whether a signed-in user sees the worker app or the customer
 * app - and asks them when the answer is not already on record.
 *
 * THE SIGNAL IS AN EXISTING PASSPORT, NOT isNewUser. `isNewUser` is false for
 * every seeded account, including both demo accounts, because the seed writes
 * the users document before anyone signs in. Hanging role selection off it
 * would mean the chooser never appears in the demo it exists for.
 *
 * A passport is the real evidence: only a kaarigar has one, nothing creates one
 * by accident, and it survives new devices and reinstalls because it lives in
 * the database rather than in this browser.
 *
 * The check is GET /api/passport/exists, which answers without creating. It
 * cannot be getProfile() - that endpoint mints a passport when the caller has
 * none, so asking "is this person a kaarigar?" would make the answer yes.
 */

/** Per-account, so two people sharing a device do not inherit each other's choice. */
const choiceKey = (uid: string) => `kaarigar_role_${uid}`;

type Decision = 'checking' | 'kaarigar' | 'customer' | 'ask' | 'error';

export const RoleGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user } = useAuth();
  const [decision, setDecision] = useState<Decision>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    // Unauthenticated is not this component's business: App renders the login
    // screen, and asking someone to pick a role before they have signed in
    // would put a choice in front of a person we cannot yet record it for.
    if (status !== 'authenticated' || !user) return;

    let cancelled = false;
    setDecision('checking');

    (async () => {
      try {
        if (await api.hasPassport()) {
          // A passport outranks a stored choice. Someone who has actually
          // onboarded as a kaarigar is a kaarigar, whatever this device
          // remembers.
          if (!cancelled) setDecision('kaarigar');
          return;
        }

        const stored = localStorage.getItem(choiceKey(user.uid));
        if (!cancelled) setDecision(stored === 'customer' ? 'customer' : 'ask');
      } catch (e) {
        if (cancelled) return;
        // A 401 has already signed the user out inside the API client.
        if (e instanceof ApiError && e.status === 401) return;
        setError(e instanceof Error ? e.message : 'Could not load your account.');
        setDecision('error');
      }
    })();

    return () => { cancelled = true; };
  }, [status, user]);

  if (status === 'loading') return <div className="min-h-screen bg-[#F3F4F6]" />;

  // Signed out: straight through to App, which owns the login screen. The gate
  // adds no step to signing in.
  if (status !== 'authenticated') return <>{children}</>;

  if (decision === 'checking') {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-orange-500 animate-pulse" />
        <p className="text-sm font-bold text-gray-500">लोड हो रहा है…</p>
      </div>
    );
  }

  /**
   * The check failed. Fall through to the worker app rather than trapping the
   * user on an error screen: that is where an existing worker was going, and a
   * customer can still reach /customer. A network blip must not lock anyone out
   * of an app that already works offline.
   */
  if (decision === 'error') {
    return (
      <>
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm font-bold text-amber-800">
          {error}
        </div>
        {children}
      </>
    );
  }

  if (decision === 'customer') return <Navigate to="/customer" replace />;
  if (decision === 'kaarigar') return <>{children}</>;

  const choose = (role: 'kaarigar' | 'customer') => {
    if (!user) return;
    localStorage.setItem(choiceKey(user.uid), role);
    // 'kaarigar' does not navigate anywhere: App is already the child, and its
    // own first load calls getProfile(), which creates the passport. From the
    // next sign-in onward that passport answers this question server-side and
    // the stored choice stops mattering.
    setDecision(role);
  };

  const card =
    'flex-1 bg-white rounded-3xl border border-gray-200 p-6 flex flex-col items-center gap-3 active:scale-[0.98] transition';

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <p className="text-xl font-extrabold text-gray-900 text-center mb-1.5">आप कौन हैं?</p>
        <p className="text-sm text-gray-500 text-center mb-6">
          यह एक बार पूछा जाएगा।
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => choose('kaarigar')} className={card}>
            <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <Hammer className="w-7 h-7" />
            </div>
            <p className="font-extrabold text-gray-900">मैं कारीगर हूँ</p>
            <p className="text-xs text-gray-500 text-center">अपना काम और कमाई दर्ज करें</p>
          </button>

          <button type="button" onClick={() => choose('customer')} className={card}>
            <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <Search className="w-7 h-7" />
            </div>
            <p className="font-extrabold text-gray-900">मुझे कारीगर चाहिए</p>
            <p className="text-xs text-gray-500 text-center">काम के लिए अनुरोध भेजें</p>
          </button>
        </div>
      </div>
    </div>
  );
};
