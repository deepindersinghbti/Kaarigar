/**
 * ============================================================================
 * FROZEN CROSS-TRACK CONTRACT
 * ============================================================================
 *
 * Tracks A, B and C code against this file independently from Day 2 onward.
 * It changes only by agreement of all three. If a task appears to need a change
 * here, stop and raise it rather than editing.
 *
 * Expanded and frozen per TYPES_PROPOSAL.md (Day 1). Scoped to the locked scope
 * in MIGRATION_PLAN.md Part 3 - no types for cut features (media, DigiLocker,
 * e-Shram, UPI, verifiable credentials, consent, audit log, disputes, geo
 * discovery, crew mode).
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

export type SupportedLanguage = 'hi' | 'pa' | 'kn' | 'mr' | 'en';

export interface LanguageOption {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  sampleGreeting: string;
}

// ---------------------------------------------------------------------------
// Identity and roles (Architecture section 3)
// ---------------------------------------------------------------------------

/**
 * Two roles only. Architecture section 3 defines six, but the locked scope
 * authenticates exactly two actors: the worker, and the customer who opens a
 * signed review link. Naming roles we neither build nor test would put
 * aspirational values in a frozen contract.
 *
 * Adding a role later is an additive change to this union and does not break
 * existing code - which is what makes starting narrow safe here.
 *
 * THE ONLY DEFINITION. The server imports this rather than declaring its own;
 * two Role types that disagree means RBAC enforces something different from
 * what the contract promises.
 */
export type Role = 'kaarigar' | 'customer';

export interface User {
  id: string;                       // client-generated UUIDv7
  phone: string;                    // E.164, e.g. +919876543210
  roles: Role[];
  languages?: SupportedLanguage[];
  createdAt: string;                // ISO 8601
  lastLoginAt?: string;
}

/** What requireAuth attaches to every authenticated request. */
export interface AuthUser {
  uid: string;
  phone: string;
  roles: Role[];
}

// ---------------------------------------------------------------------------
// Sync (Amendment 3 - localStorage outbox; WatermelonDB cut)
// ---------------------------------------------------------------------------

/**
 * Architecture section 9.1: every record shows pending / synced / failed,
 * because hidden sync erodes trust in a financial record. The storage engine
 * changed with Amendment 3; these semantics did not.
 */
export type SyncState = 'pending' | 'synced' | 'failed';

// ---------------------------------------------------------------------------
// Passport
// ---------------------------------------------------------------------------

export interface WorkerProfile {
  id: string;
  userId: string;
  passportHandle: string;           // the :handle in GET /p/:handle
  name: string;
  trade: string;
  ncoCode?: string;                 // section 4A: coded, not free text
  experienceYears: number;
  location: string;
  phone: string;
  skills: string[];
  certifications: string[];
  rating: number;
  totalJobsCount: number;
  totalEarnings: number;
  verifiedStatus: 'verified' | 'pending' | 'unverified';
  trustScore?: TrustScore;
  qrCodeUrl?: string;
  joinedDate: string;
  photoUrl?: string;
  bloodGroup?: string;
  dailyRate?: number;
  bio?: string;
}

// ---------------------------------------------------------------------------
// Jobs (Architecture section 4E)
// ---------------------------------------------------------------------------

/**
 * Eight states on the main line, plus two terminal branches. The plan's
 * "8-state job enum" describes the happy path; the enum needs ten values
 * because CANCELLED and DISPUTED are states a job can actually be in.
 */
export type JobState =
  | 'REQUESTED'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SETTLED'
  | 'REVIEWED'
  | 'CANCELLED'
  | 'DISPUTED';

/**
 * Legal transitions. Enforced server-side on every state change.
 *
 * DISPUTED was unreachable in the locked scope - representable so the data
 * could be honest, but with no inbound edge, because the dispute flow was cut.
 * It is reachable now, and the cost of getting there was exactly what the
 * original note predicted: two array entries, no enum migration and no change
 * to any of the three tracks' imports. Keeping the guard in this table rather
 * than in the union is what made that true.
 */
export const JOB_TRANSITIONS: Record<JobState, JobState[]> = {
  REQUESTED:   ['QUOTED', 'CANCELLED'],
  /**
   * QUOTED -> REQUESTED is the DECLINE edge: the customer has seen the price
   * and does not want it, but does still want the work. Sending the job back to
   * REQUESTED puts it exactly where a fresh request sits, so the kaarigar can
   * quote again down the existing REQUESTED -> QUOTED path with no second
   * mechanism to maintain.
   *
   * Anything that moves a job back to REQUESTED MUST clear quotedPrice. A
   * REQUESTED job carrying a stale price would show the customer a number the
   * worker has already withdrawn, and `quoted_price_required` would not catch
   * it because the field is populated. Both routes that can take this edge
   * unset it - see customer.ts decline and the REQUESTED branch in jobs.ts.
   *
   * A COUNTER-OFFER IS THIS SAME EDGE with a number attached. Declining says
   * "not this number"; countering says "not this number, try mine" and sets
   * counterPrice on the way back. There is no separate state for it, because a
   * countered job is in exactly the position a declined one is: waiting for the
   * kaarigar to quote. The only difference is whether they were given a figure
   * to aim at, which is a field, not a state.
   *
   * agreedPrice is untouched by any of this. It is still written in exactly one
   * place, from the stored quotedPrice, by the customer's accept.
   */
  QUOTED:      ['ACCEPTED', 'REQUESTED', 'CANCELLED'],
  ACCEPTED:    ['SCHEDULED', 'CANCELLED'],
  SCHEDULED:   ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  /**
   * COMPLETED is the WORKER'S CLAIM that the job is done. SETTLED is the
   * customer agreeing with it, and DISPUTED is the customer saying it is not.
   *
   * The two are the same shape as QUOTED -> ACCEPTED one step earlier: the
   * worker asserts, the customer answers, and the answer is what the record
   * rests on. On a job with a customerId the worker cannot take either edge -
   * see the transition route. On a job without one there is nobody to ask, so
   * COMPLETED -> SETTLED stays the worker's own one-tap path.
   */
  COMPLETED:   ['SETTLED', 'DISPUTED'],
  SETTLED:     ['REVIEWED'],
  REVIEWED:    [],
  CANCELLED:   [],
  /**
   * DISPUTED is no longer terminal. A dispute the worker cannot answer would
   * freeze the job forever and leave a permanent mark on their record with no
   * route to put it right, which is a worse outcome than the gap it replaced.
   * Going back to IN_PROGRESS is that route: the kaarigar returns to the work,
   * completes it again, and the customer answers again.
   */
  DISPUTED:    ['IN_PROGRESS'],
};

/** Display buckets. Total by construction - adding a JobState breaks the build. */
export type JobBadge = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

/**
 * A Record rather than a switch with a default: a Record fails to compile the
 * moment an eleventh state appears, whereas a default silently absorbs it and
 * renders the new state as whatever the fallback happens to be.
 */
export const JOB_BADGE: Record<JobState, JobBadge> = {
  REQUESTED:   'scheduled',
  QUOTED:      'scheduled',
  ACCEPTED:    'scheduled',
  SCHEDULED:   'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED:   'completed',
  SETTLED:     'completed',
  REVIEWED:    'completed',
  CANCELLED:   'cancelled',
  DISPUTED:    'cancelled',
};

/** Section 4E: every transition is timestamped and immutable. */
export interface JobStateTransition {
  state: JobState;
  at: string;
  by: string;                       // user id
}

export interface JobItem {
  id: string;                       // client-generated UUIDv7
  kaarigarId: string;
  title: string;
  customerName: string;             // display; customerId is the real anchor
  customerId?: string;
  customerPhone?: string;
  location: string;
  amount: number;
  /**
   * THREE PRICES, THREE DIFFERENT SPEAKERS. Who said a number is the whole
   * reason these are separate fields rather than one that gets overwritten.
   *
   *   quotedPrice   - the KAARIGAR proposes. Written when the job moves to
   *                   QUOTED, by the worker's transition route.
   *   counterPrice  - the CUSTOMER proposes. Written by the counter route
   *                   only, and it is a PROPOSAL, never an agreement.
   *   agreedPrice   - the CUSTOMER accepts. Written only by the accept
   *                   endpoint, only as a copy of the stored quotedPrice.
   *
   * So agreedPrice being present is itself the evidence that someone other
   * than the worker agreed to the number - which is the whole point of it
   * being a separate field. Never copy quotedPrice into agreedPrice anywhere
   * else, and never let either come from a request body.
   *
   * COUNTERING DOES NOT AGREE ANYTHING. A customer countering at 900 does not
   * make 900 agreed; it asks the kaarigar to re-quote there. The worker must
   * take QUOTED again - which writes THEIR quotedPrice - and the customer must
   * then accept that. Agreement stays two-sided, and counterPrice is the one
   * price field a customer-supplied body may set precisely because it binds
   * nobody on its own.
   *
   * counterPrice is cleared whenever the job is quoted again: it has been
   * answered by then, and a stale one would show the worker a figure the
   * customer is no longer asking for.
   *
   * `amount` remains the customer's opening estimate on a REQUESTED job.
   *
   * READ THESE WITH A typeof GUARD, not `!== undefined`. The driver serializes
   * an absent price as NULL, so a job that has never been quoted comes back from
   * Mongo carrying `agreedPrice: null` while the type here says `undefined`.
   * `!== undefined` is true for null and renders "₹null".
   */
  quotedPrice?: number;
  counterPrice?: number;
  agreedPrice?: number;
  bandSnapshot?: { p25: number; p50: number; p75: number };
  paymentMethod: 'cash' | 'upi' | 'pending';
  status: JobState;
  stateHistory: JobStateTransition[];
  syncState: SyncState;
  date: string;                     // occurred_on
  time?: string;
  notes?: string;
  skillsTagged?: string[];
}

// ---------------------------------------------------------------------------
// Ledger (Architecture section 4B, section 7 ledger_entries)
// ---------------------------------------------------------------------------

/** 'in' is money received; 'out' is money owed or spent (udhaar). */
export type LedgerDirection = 'in' | 'out';

/**
 * Named KamaiEntry rather than LedgerEntry to avoid a four-file rename inside
 * Track B's components. The Mongo collection is still ledger_entries.
 *
 * Append-only: corrections are reversing entries via reversesId, never
 * in-place edits (section 4B).
 */
export interface KamaiEntry {
  id: string;                       // client-generated UUIDv7; idempotency key
  profileId: string;
  direction: LedgerDirection;
  syncState: SyncState;
  date: string;                     // occurred_on
  amount: number;
  description: string;
  customerName?: string;
  paymentType: 'cash' | 'upi';
  jobId?: string;
  category?: string;
  reversesId?: string;
  settledAt?: string;               // receivables (Day 8)
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Reputation (Architecture sections 4D, 11)
// ---------------------------------------------------------------------------

export interface ReviewRatings {
  workmanship: number;              // 1-5
  punctuality: number;
  priceHonesty: number;
  cleanliness: number;
}

export interface Review {
  id: string;
  jobId: string;                    // section 4D: job-anchored, one per job
  authorId: string;
  subjectId: string;
  ratings: ReviewRatings;
  text?: string;
  response?: string;                // workers may post a public response
  createdAt: string;
}

/** Section 11 weights. A published rubric, deliberately not a learned model. */
export interface TrustScoreComponents {
  identityVerification: number;     // max 20
  skillCredentials: number;         // max 15
  verifiedWorkHistory: number;      // max 25
  customerRatings: number;          // max 25
  reliabilityRecord: number;        // -10 to 0
  skillingEngagement: number;       // max 5
}

export interface TrustScore {
  value: number;
  components: TrustScoreComponents;
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Pricing (Architecture section 4C)
// ---------------------------------------------------------------------------

export interface RateBand {
  trade: string;
  taskCode: string;
  locality: string;
  cityTier?: string;
  p25: number;
  p50: number;
  p75: number;
  sampleN: number;                  // display honestly; suppress the band
                                    // entirely below a minimum count
  wageFloor: number;                // enforced server-side, not as a UI hint
  seededFrom: string;               // e.g. "CPWD DSR 2024"
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Voice assistant
// ---------------------------------------------------------------------------

export type AssistantContext =
  | 'onboarding'
  | 'add_job'
  | 'add_kamai'
  | 'update_profile'
  | 'general_chat';

export interface AssistantMessage {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
  spokenAudioText?: string;
  timestamp: string;
  extractedData?: {
    type: 'profile' | 'job' | 'kamai';
    profile?: Partial<WorkerProfile>;
    job?: Partial<JobItem>;
    kamai?: {
      total: number;
      entries: Array<{ desc: string; amount: number }>;
    };
  };
  requiresConfirmation?: boolean;
}

export interface VoiceAssistantSession {
  context: AssistantContext;
  currentStep: number;
  messages: AssistantMessage[];
  pendingData: any;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  interimTranscript: string;
}

/**
 * Which code path served an assistant response. Without this, the Gemini path
 * and the 237-line keyword fallback both return a well-formed 200 and are
 * indistinguishable - which is how the fallback carried the entire demo
 * unnoticed.
 */
export type AssistantSource = 'gemini' | 'fallback';

export type AssistantFallbackReason =
  | 'no_api_key'                    // GEMINI_API_KEY missing
  | 'empty_response'                // Gemini replied with no text
  | 'invalid_json'                  // replied, but the body would not parse
  | 'api_error';                    // threw - quota, auth, network, bad model

interface AssistantProcessBase {
  replyText: string;
  isComplete: boolean;
  requiresConfirmation: boolean;
  nextStep: number;
  extractedData?: AssistantMessage['extractedData'];
}

/**
 * Discriminated on `source`: a fallback response cannot omit its reason, and a
 * Gemini response cannot carry one.
 *
 * The earlier shape - `fallbackReason?: AssistantFallbackReason | null` - had
 * three ways to say "absent" and let `{ source: 'fallback' }` with no reason
 * compile, which is precisely the case this field exists to catch.
 *
 * Track A: the server must OMIT the key on the Gemini path, not send null.
 * JSON.stringify drops undefined properties, so returning the object without
 * the key is enough.
 */
export type AssistantProcessResponse =
  | (AssistantProcessBase & { source: 'gemini'; fallbackReason?: never })
  | (AssistantProcessBase & { source: 'fallback'; fallbackReason: AssistantFallbackReason });
