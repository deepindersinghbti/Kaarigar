import { authHeader } from './authToken';
import type { JobItem, KamaiEntry, SyncState } from '../types';

/**
 * The offline outbox.
 *
 * Owner: Track B. Section 9 of the architecture, which calls this "the single
 * most important engineering decision in the product".
 *
 * THE PRINCIPLE (9.1): the device is the source of truth for creation. Every
 * write succeeds locally first and enters this queue. The UI never blocks on
 * the network and never shows a spinner for a local action. A worker in a
 * basement logging a payment gets the same instant confirmation as one on wifi.
 *
 * WHY THIS IS NOT THE WRITE-THROUGH IT REPLACES. The previous behaviour posted
 * optimistically and ROLLED BACK on failure. That is correct online and wrong
 * offline: it deletes a payment the worker just recorded because the network
 * happened to be absent, which is the exact opposite of what a money record
 * must do. Nothing is rolled back now - it is queued, and its state is visible.
 */

const KEY = 'kaarigar_outbox_v1';

/** Section 9.2 step 3: batches of up to 50. The server rejects 51 with a 413. */
const MAX_BATCH = 50;

export type OutboxKind = 'job' | 'ledger_entry';

export interface OutboxItem {
  /** The record's own client-generated UUIDv7. The server is idempotent on it. */
  id: string;
  kind: OutboxKind;
  payload: JobItem | KamaiEntry;
  queuedAt: string;
  attempts: number;
  /** Set when the server rejected it permanently. Shown to the worker. */
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * The queue survives a reload, a crash, and a week offline (section 13:
 * "7 days of full functionality"). In-memory only would lose a day's entries to
 * a browser restart, which is the failure this whole module exists to prevent.
 *
 * Every accessor is failure-tolerant: private-mode browsers throw on
 * localStorage, and a corrupt value must degrade to an empty queue rather than
 * taking down the app at boot.
 */
function read(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: OutboxItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked. The item is still in memory for this session.
    // Losing the queue is bad; crashing the write that created it is worse.
  }
}

// ---------------------------------------------------------------------------
// Observers
// ---------------------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to queue changes. Returns an unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

// ---------------------------------------------------------------------------
// Queue operations
// ---------------------------------------------------------------------------

export function list(): OutboxItem[] {
  return read();
}

export function pendingCount(): number {
  return read().filter((i) => !i.lastError).length;
}

export function failedCount(): number {
  return read().filter((i) => !!i.lastError).length;
}

/**
 * The sync state of one record, for its badge.
 *
 * Anything not in the queue is synced: an item leaves only when the server has
 * accepted it. That makes 'synced' the assertion "the server holds this", not
 * "we tried".
 */
export function stateOf(recordId: string): SyncState {
  const item = read().find((i) => i.id === recordId);
  if (!item) return 'synced';
  return item.lastError ? 'failed' : 'pending';
}

/** Queue a record for upload. Replaces any earlier queue entry with the same id. */
export function enqueue(kind: OutboxKind, payload: JobItem | KamaiEntry): void {
  const items = read().filter((i) => i.id !== payload.id);
  items.push({
    id: payload.id,
    kind,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
  write(items);
  notify();
  scheduleFlush();
}

/**
 * Drop a permanently-failed item.
 *
 * Only ever called for an item the worker has been shown and has dismissed. A
 * failed item is never removed silently - section 9.1 requires the state be
 * visible, and quietly discarding a rejected payment is the worst outcome
 * available here.
 */
export function discard(recordId: string): void {
  write(read().filter((i) => i.id !== recordId));
  notify();
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

export interface FlushOutcome {
  attempted: number;
  accepted: number;
  stillPending: number;
  failed: number;
  /** True when the flush could not reach the server at all. */
  offline: boolean;
}

let flushing = false;
let flushScheduled = false;
let flushRequestedWhileBusy = false;

/**
 * Coalesce synchronous enqueues into one immediate batch. The write still
 * succeeds locally first; this only removes the avoidable 30-second wait when
 * the device is already online.
 */
function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    if (flushing) {
      flushRequestedWhileBusy = true;
      return;
    }
    void flush();
  });
}

/**
 * Send the queue to /api/sync/batch and apply the per-item verdicts.
 *
 * SINGLE-FLIGHT. A reconnect event, a periodic tick and a fresh write can all
 * fire within the same second. Two concurrent flushes would post the same items
 * twice; the server is idempotent so nothing corrupts, but the second response
 * would be applied to a queue the first had already rewritten, resurrecting
 * items that were just accepted.
 */
export async function flush(): Promise<FlushOutcome> {
  const queued = read().filter((i) => !i.lastError);
  const idle: FlushOutcome = { attempted: 0, accepted: 0, stillPending: 0, failed: 0, offline: false };

  if (flushing || queued.length === 0) return idle;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ...idle, offline: true, stillPending: queued.length };
  }

  flushing = true;
  try {
    /**
     * CAUSAL ORDER (9.2 step 3): jobs before the ledger entries that reference
     * them. The server sorts defensively too, but only within one batch - so if
     * a job and its entry land in different batches, the order here is what
     * keeps the entry from arriving before the job it points at.
     */
    const ordered = [
      ...queued.filter((i) => i.kind === 'job'),
      ...queued.filter((i) => i.kind !== 'job'),
    ];
    const batch = ordered.slice(0, MAX_BATCH);

    let res: Response;
    try {
      res = await fetch('/api/sync/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ items: batch.map((i) => ({ kind: i.kind, payload: i.payload })) }),
      });
    } catch {
      // Network unreachable. Nothing changes state: everything stays pending,
      // which is exactly right - the records are safe and will go up later.
      return { ...idle, attempted: batch.length, stillPending: queued.length, offline: true };
    }

    if (!res.ok) {
      // A batch-level rejection (400/413) is a bug in what we sent, not in any
      // one item. Keep everything queued and let it surface rather than
      // silently dropping a worker's week of entries on a shape error.
      return { ...idle, attempted: batch.length, stillPending: queued.length };
    }

    const body = await res.json();
    const results: Array<{
      index: number;
      status: 'accepted' | 'duplicate' | 'rejected';
      retryable: boolean;
      message?: string;
      field?: string;
    }> = Array.isArray(body?.results) ? body.results : [];

    const current = read();
    let accepted = 0;
    let failed = 0;

    for (const r of results) {
      const sent = batch[r.index];
      if (!sent) continue;
      const at = current.findIndex((i) => i.id === sent.id);
      if (at === -1) continue;

      if (r.status === 'accepted' || r.status === 'duplicate') {
        // 'duplicate' means the server already holds it - success from the
        // outbox's point of view, and the reason a replayed batch is harmless.
        current.splice(at, 1);
        accepted++;
      } else if (!r.retryable) {
        // Permanent. Keep it, marked failed, with the server's own wording -
        // "amount must be a positive number" tells the worker what to fix;
        // dropping it tells them nothing and loses the record.
        current[at] = {
          ...current[at],
          attempts: current[at].attempts + 1,
          lastError: r.message ?? 'This entry was rejected.',
        };
        failed++;
      } else {
        current[at] = { ...current[at], attempts: current[at].attempts + 1 };
      }
    }

    write(current);
    notify();

    return {
      attempted: batch.length,
      accepted,
      failed,
      stillPending: current.filter((i) => !i.lastError).length,
      offline: false,
    };
  } finally {
    flushing = false;
    if (flushRequestedWhileBusy) {
      flushRequestedWhileBusy = false;
      scheduleFlush();
    }
  }
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

let started = false;

/**
 * Wire the flush triggers. Idempotent - safe to call from a re-running effect.
 *
 * Section 9.2 step 2: "connectivity listener or a periodic job wakes the sync
 * engine." Both, because neither is sufficient alone: the online event does not
 * fire if the app starts while already connected, and a browser can report
 * onLine true on a captive portal that carries no traffic.
 */
export function startOutbox(): () => void {
  if (started) return () => {};
  started = true;

  const onOnline = () => void flush();
  window.addEventListener('online', onOnline);

  // Deliberately slow. The queue is not latency-sensitive - it exists because
  // the network is absent - and a tight poll on a low-end device costs battery
  // for nothing.
  const timer = setInterval(() => void flush(), 30_000);

  void flush();

  return () => {
    window.removeEventListener('online', onOnline);
    clearInterval(timer);
    started = false;
  };
}
