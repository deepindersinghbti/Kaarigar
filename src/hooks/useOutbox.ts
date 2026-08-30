import { useCallback, useEffect, useState } from 'react';
import {
  failedCount,
  flush,
  list,
  pendingCount,
  startOutbox,
  stateOf,
  subscribe,
  type OutboxItem,
} from '../lib/outbox';
import type { SyncState } from '../types';

/**
 * React binding for the outbox.
 *
 * Owner: Track B.
 *
 * The queue lives in a plain module rather than in React state on purpose: it
 * must survive unmounts, keep flushing while no component is watching, and be
 * writable from a save handler that has no hook context. This hook is the
 * read-side view of it.
 */

export interface OutboxView {
  pending: number;
  failed: number;
  offline: boolean;
  items: OutboxItem[];
  /** The sync state of one record, for its badge. */
  stateOf: (recordId: string) => SyncState;
  /** Flush now - the manual retry behind the summary's button. */
  retry: () => void;
}

export function useOutbox(): OutboxView {
  const [, bump] = useState(0);
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine === false : false
  );

  useEffect(() => {
    // One subscription re-renders on every queue change - enqueue, accept,
    // fail - so badges and the summary cannot drift from the queue.
    const unsubscribe = subscribe(() => bump((n) => n + 1));
    const stop = startOutbox();

    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);

    return () => {
      unsubscribe();
      stop();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const retry = useCallback(() => {
    // Retries PENDING items only. Permanently-failed ones are deliberately not
    // re-sent: they were classified permanent because the server said the
    // request can never succeed as sent (a validation failure, an id conflict),
    // and re-posting identical bytes is the retry-forever bug that lib/retry.ts
    // exists to prevent. They stay visible as failed until the worker acts on
    // them, which is honest rather than a button that quietly does nothing.
    void flush();
  }, []);

  return {
    pending: pendingCount(),
    failed: failedCount(),
    offline,
    items: list(),
    stateOf,
    retry,
  };
}
