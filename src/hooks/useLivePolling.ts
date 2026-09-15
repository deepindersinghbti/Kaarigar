import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Opt-in polling for a list screen, and the toggle that controls it.
 *
 * WHY POLLING RATHER THAN A PUSH CHANNEL. render.yaml pins the free plan, which
 * spins down on inactivity. A long-lived SSE or websocket connection through
 * that is the least predictable thing to put in front of a live audience: the
 * stream drops on spin-down and on any proxy timeout, and every such failure
 * needs reconnect, backoff and replay to look like nothing happened. A poll has
 * none of that machinery because a missed tick simply means the next one does
 * the work.
 *
 * WHY IT IS OFF UNTIL SWITCHED ON. See the note on CustomerRequests: during the
 * demo the refresh is a button so that an update which appears after a tap is
 * unambiguously caused by that tap. An interval firing at the right moment
 * would make a working end-to-end loop indistinguishable from a lucky one.
 * Turning the toggle on afterwards shows the same loop running unattended,
 * which is a second demonstration rather than a replacement for the first.
 */
const DEFAULT_INTERVAL_MS = 10_000;

interface LivePollingOptions {
  /** Re-fetch. Errors are the caller's business; this hook only schedules. */
  onTick: () => Promise<unknown>;
  /**
   * Suppress ticks without turning the toggle off - used while the user is
   * mid-interaction, so a refresh cannot pull the row out from under a form
   * they are typing into or an action already in flight.
   */
  paused?: boolean;
  intervalMs?: number;
  /** localStorage key, so the choice survives a reload. */
  storageKey: string;
}

export interface LivePolling {
  enabled: boolean;
  toggle: () => void;
}

export function useLivePolling({
  onTick,
  paused = false,
  intervalMs = DEFAULT_INTERVAL_MS,
  storageKey,
}: LivePollingOptions): LivePolling {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(storageKey) === 'on';
    } catch {
      // Private windows and blocked site data both throw here. Defaulting to
      // off is the same answer as never having set it, which is correct.
      return false;
    }
  });

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? 'on' : 'off');
      } catch {
        // The toggle still works for this session; it just will not be
        // remembered. Not worth surfacing.
      }
      return next;
    });
  }, [storageKey]);

  /**
   * onTick is held in a ref so that a caller passing an inline closure - which
   * is every caller, since the fetch closes over component state - does not
   * tear down and rebuild the interval on every render. The effect below then
   * depends only on things that should genuinely restart it.
   */
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  /** Guards against ticks stacking when one request outlives the interval. */
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const run = async () => {
      // A hidden tab is not being watched, and on a free plan every avoided
      // request matters. The visibilitychange listener below catches up the
      // moment it is looked at again, so nothing is stale on return.
      if (document.hidden || pausedRef.current || inFlight.current) return;
      inFlight.current = true;
      try {
        await tickRef.current();
      } catch {
        // Swallowed on purpose. The caller's own fetch already reports failure
        // the way that screen reports failures; a poll that fails is not a
        // second, different error worth telling the user about.
      } finally {
        inFlight.current = false;
      }
    };

    const id = window.setInterval(run, intervalMs);
    const onVisible = () => { if (!document.hidden) void run(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs]);

  return { enabled, toggle };
}
