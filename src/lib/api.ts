import { authHeader } from './authToken';
import type { Area } from './areas';
import type { JobItem, JobState, KamaiEntry, RateBand, WorkerProfile } from '../types';

/**
 * A kaarigar as the customer-facing directory sees them.
 *
 * Picked from WorkerProfile to mirror the server's PublicProfile, so the two
 * cannot describe different shapes. NOT the privacy boundary - that is the
 * projection in server/data/profiles.ts, which decides what actually leaves the
 * database. This type only describes what arrives, and narrowing it here would
 * hide fields rather than withhold them.
 */
export type PublicKaarigar = Pick<
  WorkerProfile,
  | 'passportHandle'
  | 'name'
  | 'trade'
  | 'ncoCode'
  | 'experienceYears'
  | 'location'
  | 'skills'
  | 'certifications'
  | 'rating'
  | 'totalJobsCount'
  | 'verifiedStatus'
  | 'joinedDate'
  | 'bio'
>;

/** What a customer fills in when asking a kaarigar for work. */
export interface JobRequestInput {
  /** Client-generated UUIDv7. The server is idempotent on it. */
  id: string;
  kaarigarHandle: string;
  title: string;
  customerName: string;
  location: string;
  amount: number;
  notes?: string;
}

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

/**
 * A customer's own job, as GET /api/customer/jobs returns it: the stored
 * JobItem plus the kaarigar it was sent to.
 *
 * DECLARED HERE RATHER THAN ON JobItem because types.ts is the frozen
 * cross-track contract and this field is not stored on the job - the server
 * joins it on for this one response. Widening JobItem would tell the worker
 * screens and the sync layer that a field exists which, for them, never does.
 *
 * `phone` is present only while the job is ACCEPTED or later; before that the
 * server omits it. Treat its absence as normal, not as an error.
 */
export type CustomerJobItem = JobItem & {
  kaarigar?: { passportHandle: string; name: string; trade: string; phone?: string };
};

export const api = {
  async getProfile(): Promise<WorkerProfile> {
    const body = await request<{ profile: WorkerProfile }>('/api/passport/me');
    return body.profile;
  },

  /**
   * Does this user have a passport yet?
   *
   * Deliberately NOT getProfile(). That endpoint creates a passport when there
   * is none, so using it to decide whether someone is a kaarigar would make
   * every customer into one on sign-in.
   */
  async hasPassport(): Promise<boolean> {
    const body = await request<{ hasPassport: boolean }>('/api/passport/exists');
    return body.hasPassport;
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
   * Advance a job through the server-owned lifecycle state machine.
   *
   * quotedPrice is required by the server when state is 'QUOTED' and refused on
   * every other edge, so it is passed through rather than defaulted here - a
   * default would be this client inventing a price.
   */
  async transitionJob(jobId: string, state: JobState, quotedPrice?: number): Promise<JobItem> {
    const body = await request<{ job: JobItem }>(
      `/api/jobs/${encodeURIComponent(jobId)}/transition`,
      {
        method: 'POST',
        body: JSON.stringify({ state, ...(quotedPrice !== undefined ? { quotedPrice } : {}) }),
      }
    );
    return body.job;
  },

  /**
   * The customer agrees to the quoted price.
   *
   * NO PRICE IS SENT. The server copies the agreed figure from the quotedPrice
   * it already stored, so there is no number here for a client to alter. If this
   * ever needs an amount parameter, something has gone wrong server-side.
   */
  async acceptQuote(jobId: string): Promise<JobItem> {
    const body = await request<{ job: JobItem }>(
      `/api/customer/jobs/${encodeURIComponent(jobId)}/accept`,
      { method: 'POST' }
    );
    return body.job;
  },

  /**
   * Refuse the price without giving up the job: the server puts the request
   * back to REQUESTED and clears the quote, so the kaarigar can send another.
   *
   * NO PRICE IS SENT, for the same reason acceptQuote sends none. Declining
   * says "not this number", not "this number instead" - naming a counter-offer
   * is negotiation and does not exist yet.
   */
  async declineQuote(jobId: string): Promise<JobItem> {
    const body = await request<{ job: JobItem }>(
      `/api/customer/jobs/${encodeURIComponent(jobId)}/decline`,
      { method: 'POST' }
    );
    return body.job;
  },

  /**
   * Decline, but name a figure: "not this number, try mine".
   *
   * THE ONLY CALL ON THIS CLIENT THAT SENDS A PRICE TO A CUSTOMER ROUTE, and
   * it is safe because counterPrice agrees to nothing. The job goes back to
   * REQUESTED carrying the ask; the kaarigar must quote again - writing their
   * own quotedPrice - and the customer must accept THAT before any number
   * becomes agreed. Countering at 1 buys nothing on its own.
   *
   * The server caps how many times one customer may send a job back. Past the
   * cap this answers 409 `counter_limit_reached` and the customer is left with
   * accept, decline or cancel.
   */
  async counterQuote(jobId: string, counterPrice: number): Promise<JobItem> {
    const body = await request<{ job: JobItem }>(
      `/api/customer/jobs/${encodeURIComponent(jobId)}/counter`,
      { method: 'POST', body: JSON.stringify({ counterPrice }) }
    );
    return body.job;
  },

  /**
   * Call the request off entirely.
   *
   * The server accepts this only while the job is REQUESTED, QUOTED or
   * ACCEPTED. Once the kaarigar has scheduled or started, it answers 409 and
   * the customer is told to call them - see the cancel route's own note on why
   * that is narrower than JOB_TRANSITIONS allows.
   */
  async cancelRequest(jobId: string): Promise<JobItem> {
    const body = await request<{ job: JobItem }>(
      `/api/customer/jobs/${encodeURIComponent(jobId)}/cancel`,
      { method: 'POST' }
    );
    return body.job;
  },

  /**
   * The customer's answer to the kaarigar's claim that the work is done.
   *
   * COMPLETED is the worker asserting it; SETTLED is this. Until one of these
   * is called, a completed customer job is one party's word and must not be
   * presented as anything more.
   */
  async confirmCompletion(jobId: string): Promise<JobItem> {
    const body = await request<{ job: JobItem }>(
      `/api/customer/jobs/${encodeURIComponent(jobId)}/confirm`,
      { method: 'POST' }
    );
    return body.job;
  },

  /**
   * The other answer: the work is not done.
   *
   * Sends no reason. A dispute is not the end of the job - the server puts it
   * in DISPUTED, from which the kaarigar can return to IN_PROGRESS, fix the
   * work and complete it again.
   */
  async disputeCompletion(jobId: string): Promise<JobItem> {
    const body = await request<{ job: JobItem }>(
      `/api/customer/jobs/${encodeURIComponent(jobId)}/dispute`,
      { method: 'POST' }
    );
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

  /**
   * The kaarigar directory a customer browses.
   *
   * Server-side this is the same projection that backs the public passport
   * page, so nothing arrives that /p/:handle would not already show a stranger.
   */
  async listKaarigars(trade?: string, near?: Area): Promise<PublicKaarigar[]> {
    const params = new URLSearchParams();
    if (trade) params.set('trade', trade);
    // Ranks the caller's area first; never filters anybody out, and an area the
    // server does not recognise is ignored rather than refused.
    if (near) params.set('near', near);
    const qs = params.toString();
    const body = await request<{ kaarigars: PublicKaarigar[] }>(`/api/kaarigars${qs ? `?${qs}` : ''}`);
    return body.kaarigars;
  },

  /**
   * Ask a named kaarigar for work.
   *
   * SYNCHRONOUS ON PURPOSE, and deliberately not the outbox. The outbox exists
   * because a worker recording their own completed job must never lose it to a
   * missing network - the record is theirs and already true. A request to
   * someone else is the opposite: it is not true until the server has it, and
   * queueing one would tell a customer their request was sent when no kaarigar
   * has been asked anything. A failure here is reported, not stored.
   *
   * The kaarigar is named by PASSPORT HANDLE. There is no user id in this
   * payload because the directory never publishes one - the server resolves the
   * handle to an owner itself.
   */
  async requestJob(input: JobRequestInput): Promise<JobItem> {
    const body = await request<{ job: JobItem }>('/api/customer/jobs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return body.job;
  },

  /** The caller's own requests, newest first. */
  async listCustomerJobs(): Promise<CustomerJobItem[]> {
    const body = await request<{ jobs: CustomerJobItem[] }>('/api/customer/jobs');
    return body.jobs;
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
