import { authHeader } from './authToken';
import type { JobItem, KamaiEntry, RateBand, WorkerProfile } from '../types';

export interface PricingBandResult extends Partial<RateBand> {
  trade: string;
  taskCode: string;
  locality: string;
  suppressed: boolean;
  confidence: 'observed' | 'seeded' | 'suppressed';
  sampleN: number;
  minObservations: number;
  message?: string;
  basis?: string;
  floored?: boolean;
  floorApplicable?: boolean;
}

/**
 * The typed client for every authenticated endpoint the screens use.
 *
 * Owner: Track B.
 *
 * ONE PLACE THAT KNOWS THE WIRE FORMAT. Every route wraps its payload in a
 * named key - { profile }, { jobs }, { entry } - and every screen wants the
 * value, not the envelope. Unwrapping here means a screen never writes
 * `body.profile` and no screen has to be corrected if a route's envelope
 * changes.
 *
 * It also means the Authorization header is attached in exactly one function.
 * The seam in authToken.ts is only worth having if there is a single caller of
 * it per concern, and this is that caller for data reads and writes.
 */

/**
 * A failed request, carrying enough to act on rather than just to log.
 *
 * `field` is populated because every write endpoint names the offending field
 * on a validation failure. Discarding that and showing "save failed" would
 * throw away the one thing that tells a worker what to fix - the exact defect
 * the audit found on the client side.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/**
 * Called when any request comes back 401.
 *
 * AuthProvider registers its sign-out here at mount. The indirection exists so
 * that this module does not import AuthProvider, which imports authStore, which
 * this module's authHeader dependency also reaches - a cycle that Vite resolves
 * by handing one of them a partially-initialised module at runtime.
 *
 * A 401 on a data read means the access token expired without the refresh timer
 * getting a turn - a backgrounded tab with throttled timers is the ordinary
 * cause. Signing out is the honest response: the alternative is a screen that
 * renders empty and looks like a worker with no jobs.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    // Distinguished from an API error on purpose. The network being absent is
    // the normal state for this user group (section 9), not a defect, and the
    // caller should be able to tell the difference without parsing a string.
    throw new ApiError(0, 'network_unreachable', 'No connection. Your data is safe on this device.');
  }

  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError(401, 'unauthorized', 'Your session ended. Please sign in again.');
  }

  if (!res.ok) {
    let code = 'request_failed';
    let message = `Request failed (${res.status}).`;
    let field: string | undefined;
    try {
      const body = await res.json();
      if (typeof body?.error === 'string') code = body.error;
      if (typeof body?.message === 'string') message = body.message;
      if (typeof body?.field === 'string') field = body.field;
    } catch {
      /* non-JSON body; keep the defaults */
    }
    throw new ApiError(res.status, code, message, field);
  }

  // 204 has no body. Reading one would throw on a perfectly successful call.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  async getProfile(): Promise<WorkerProfile> {
    const body = await request<{ profile: WorkerProfile }>('/api/passport/me');
    return body.profile;
  },

  async patchProfile(patch: Partial<WorkerProfile>): Promise<WorkerProfile> {
    const body = await request<{ profile: WorkerProfile }>('/api/passport/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return body.profile;
  },

  async listJobs(): Promise<JobItem[]> {
    const body = await request<{ jobs: JobItem[] }>('/api/jobs');
    return body.jobs;
  },

  async listPricingTasks(): Promise<Array<{ trade: string; taskCode: string }>> {
    const body = await request<{ tasks: Array<{ trade: string; taskCode: string }> }>('/api/pricing/tasks');
    return body.tasks;
  },

  async getPricingBand(trade: string, taskCode: string, locality?: string): Promise<PricingBandResult> {
    const params = new URLSearchParams({ trade, taskCode });
    if (locality) params.set('locality', locality);
    return request<PricingBandResult>(`/api/pricing/band?${params.toString()}`);
  },

  /**
   * Create a job. The client-generated UUIDv7 already on the object is sent as
   * the id, and the server is idempotent on it, so a retry after a timeout
   * returns the existing job rather than creating a second one.
   */
  async createJob(job: JobItem): Promise<JobItem> {
    const body = await request<{ job: JobItem }>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(job),
    });
    return body.job;
  },

  /**
   * Mint the review link a worker sends to their customer.
   *
   * Owner-scoped server-side: minting for a job you do not own answers 404, so
   * there is nothing to check here beyond being signed in. The URL comes back
   * absolute, built from the server's own resolveOrigin(), so it matches the
   * passport QR's origin rather than being reassembled on the client.
   */
  async createReviewLink(jobId: string): Promise<{ url: string; jobId: string }> {
    return request<{ url: string; jobId: string }>('/api/reviews/link', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  },

  async listEntries(period = 'all'): Promise<KamaiEntry[]> {
    const body = await request<{ entries: KamaiEntry[] }>(
      `/api/ledger/entries?period=${encodeURIComponent(period)}`
    );
    return body.entries;
  },

  /** Create a ledger entry. Idempotent on the client id, as with jobs. */
  async createEntry(entry: KamaiEntry): Promise<KamaiEntry> {
    const body = await request<{ entry: KamaiEntry }>('/api/ledger/entries', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
    return body.entry;
  },

  /** Download the server-generated append-only ledger statement. */
  async downloadIncomeStatement(months: 6 | 12 = 6): Promise<Blob> {
    let res: Response;
    try {
      res = await fetch('/api/ledger/export/income-statement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(),
        },
        body: JSON.stringify({ months }),
      });
    } catch {
      throw new ApiError(0, 'network_unreachable', 'No connection. Your data is safe on this device.');
    }

    if (res.status === 401) {
      onUnauthorized?.();
      throw new ApiError(401, 'unauthorized', 'Your session ended. Please sign in again.');
    }
    if (!res.ok) {
      let message = `Request failed (${res.status}).`;
      try {
        const body = await res.json();
        if (typeof body?.message === 'string') message = body.message;
      } catch {
        /* non-JSON body; keep the default */
      }
      throw new ApiError(res.status, 'income_statement_failed', message);
    }
    return res.blob();
  },
};
