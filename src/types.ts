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

// ===========================================================================
// BEGIN: Booking commitments & reliability (added — KAARIGAR_RELIABILITY_FEATURE.md §3)
// ===========================================================================
//
// APPEND-ONLY ADDITION. Nothing above this marker was renamed, reordered or
// modified. Every type below is new, so no existing import changes meaning.
//
// CONVENTIONS THIS BLOCK FOLLOWS, taken from the code rather than the brief:
//
//   ids         plain `string`, a UUIDv7 from lib/ids.ts, used as the Mongo
//               `_id` and mapped back to `id` on read. There is no ObjectId
//               anywhere in this codebase and this block does not introduce one.
//   timestamps  ISO 8601 strings on the wire and in the contract, exactly as
//               JobStateTransition.at, Review.createdAt and KamaiEntry.createdAt
//               already are. How the server stores them (Date vs string) is a
//               Phase 2 decision and does not change these field types.
//   ids of      customerId / kaarigarId are USER ids (the `uid` on AuthUser),
//   the parties the same anchor JobItem.customerId and JobItem.kaarigarId use —
//               NOT profile ids and not passport handles.
//
// RELATIONSHIP TO JobItem — READ THIS BEFORE WIRING THE TWO TOGETHER.
//
// A Booking is NOT a JobItem and BookingStatus is NOT JobState. They share three
// spellings (REQUESTED, ACCEPTED, COMPLETED) and mean different things by them:
// JobState tracks the PRICE conversation (quote, counter, agree, settle),
// BookingStatus tracks the APPOINTMENT (commit to a slot, turn up, be late).
// A job can be ACCEPTED-the-price and NO_SHOW-the-visit at the same time, which
// is the whole reason the reliability feature exists and the reason these are
// two unions rather than ten more entries in one.
//
// Nothing here is linked to JobItem yet, deliberately. Whether a Booking gains a
// `jobId`, or JobItem gains a `bookingId`, or they stay disjoint for the demo,
// is an open contract question for Phase 2 — and answering it by widening
// JobItem would be an edit to a frozen type, not an addition.

/**
 * The appointment lifecycle. See §9.4 of KAARIGAR_RELIABILITY_FEATURE.md for
 * the authoritative job-edge × booking-edge × event table.
 *
 * RESPONDED AND COMMITTED ARE DELIBERATELY NOT CALLED "ACCEPTED". The brief's
 * §1 had one ACCEPTED covering both "the kaarigar took the job on" and "the
 * kaarigar named a time", which are separated here by the whole price
 * negotiation. Worse, either reading collides with JobState.ACCEPTED, which
 * means something third again - the CUSTOMER agreed the price. Three distinct
 * facts sharing one word on a screen about money is a bug waiting to be filed,
 * so they get three names:
 *
 *   RESPONDED  the kaarigar replied inside acceptBy - they quoted. The price
 *              conversation may still be running (quote, counter, agree) and
 *              there is NO slot yet, so no arrival deadline can exist.
 *   COMMITTED  a slot is chosen. arriveBy and the check-in OTP are set, and
 *              the lateness clocks start here and nowhere else.
 *
 * Only REQUESTED and COMPLETED are now spelled the same as a JobState, and both
 * still mean something different. Do not assign one union to the other.
 */
export type BookingStatus =
  | 'REQUESTED'
  | 'RESPONDED'
  | 'COMMITTED'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'LATE'
  | 'NO_SHOW'
  | 'EXPIRED'
  | 'DECLINED'
  | 'CANCELLED_BY_CUSTOMER'
  | 'CANCELLED_BY_KAARIGAR';

/**
 * One entry in a booking's immutable transition log, appended on every move.
 *
 * `by` NAMES A ROLE, NOT A USER — unlike JobStateTransition.by, which is a user
 * id. Two reasons, and the divergence is intentional rather than an oversight:
 * a booking already carries customerId and kaarigarId, so the role identifies
 * the actor unambiguously; and the sweeper has no user id to write, which is
 * what 'system' is for. `from` is null only for the entry that creates the
 * booking, which has no previous state.
 */
export interface BookingHistoryEntry {
  from: BookingStatus | null;
  to: BookingStatus;
  by: 'customer' | 'kaarigar' | 'system';
  at: string;                       // ISO 8601
  note?: string;
}

/**
 * A kaarigar's proposal of a new slot, pending the customer's answer.
 *
 * A PROPOSAL, NEVER AN AGREEMENT — the same distinction JobItem draws between
 * counterPrice and agreedPrice. It does not become the booking's slot until the
 * customer approves it, at which point slotStart/slotEnd are rewritten and this
 * field is cleared.
 */
export interface RescheduleRequest {
  slotStart: string;                // ISO 8601
  slotEnd: string;                  // ISO 8601
  reason?: string;
  requestedAt: string;              // ISO 8601
}

/**
 * A commitment to attend, and the record of whether it was kept.
 *
 * THIS IS THE CLIENT-FACING SHAPE. The stored document additionally carries
 * otpHash, otpAttempts and otpLockedUntil, which are deliberately absent from
 * this interface: the arrival code proves the kaarigar reached the customer, so
 * a kaarigar who can read it — or read its hash — proves nothing at all. The
 * omission is the contract. A server-side document type that extends this with
 * those three fields belongs in the data layer, never here, so that no client
 * module can name them.
 *
 * DEADLINES ARE SERVER-COMPUTED, never sent by a client: acceptBy from the
 * accept window at creation, arriveBy from slotEnd plus the arrival grace.
 */
export interface Booking {
  id: string;                       // server-generated UUIDv7 (lib/ids.ts)
  /**
   * The JobItem this booking is the appointment for.
   *
   * ONE REQUEST FLOW, TWO RECORDS. There is no second "request a kaarigar"
   * button: a customer's request creates a JobItem exactly as it does today,
   * and a Booking alongside it holding the time commitment the job has no
   * fields for. The job owns the PRICE conversation, the booking owns the
   * APPOINTMENT, and this is the only link between them.
   *
   * The link is declared on THIS side because Booking is new. Putting a
   * `bookingId` on JobItem would edit a frozen type; this does not.
   *
   * Optional because a worker's own job - no customerId, nobody to commit a
   * slot to - has no booking at all, and because a booking is still a coherent
   * record if the job link is ever dropped. In the flow shipped here it is
   * always set.
   */
  jobId?: string;
  customerId: string;               // AuthUser.uid of the customer
  kaarigarId: string;               // AuthUser.uid of the kaarigar
  jobTitle: string;
  description?: string;
  address?: string;
  urgent: boolean;                  // selects the accept window, nothing else
  status: BookingStatus;
  createdAt: string;                // ISO 8601
  /**
   * First-response deadline. REQUESTED past this becomes EXPIRED.
   *
   * NEVER MUTATED. It stops applying because the booking leaves REQUESTED, not
   * because the field changes - so it survives as the record of what the
   * kaarigar was actually given.
   */
  acceptBy: string;                 // ISO 8601
  /**
   * Slot-commitment deadline. RESPONDED past this becomes EXPIRED.
   *
   * ARMED ONLY WHEN THE PRICE IS AGREED - when the linked job reaches
   * JobState.ACCEPTED - and absent until then. That absence is the whole
   * mechanism by which no deadline runs while the ball is in the customer's
   * court: a quoted or countered job has no scheduleBy, so the sweeper's
   * { status: 'RESPONDED', scheduleBy: { $lte: now } } cannot match it, with
   * no special case anywhere.
   *
   * Expiring here writes LATE_CANCEL, not EXPIRED: the kaarigar took the work
   * on and then let an agreed job rot, which is a broken commitment rather than
   * an unanswered request. That also keeps the ledger's unique
   * { bookingId, type } key usable even though both routes end in EXPIRED.
   */
  scheduleBy?: string;              // ISO 8601
  slotStart?: string;               // ISO 8601 — set at COMMITTED
  slotEnd?: string;                 // ISO 8601 — set at COMMITTED
  /**
   * slotEnd + ARRIVAL_GRACE_MIN. Set at COMMITTED and nowhere else.
   *
   * MUST BE ABSENT, NEVER null, when there is no slot. BSON orders null below
   * Date, so `{ arriveBy: { $lte: now } }` matches a null - a booking with a
   * nulled arriveBy would be swept LATE the instant it was written. The sweeper
   * filters on status COMMITTED as well, so correctness does not rest on this,
   * but do not weaken it: it is the second lock on the same door.
   */
  arriveBy?: string;                // ISO 8601
  arrivedAt?: string;               // ISO 8601 — set by a successful check-in
  completedAt?: string;             // ISO 8601
  /**
   * Reschedule ATTEMPTS used, incremented when the kaarigar asks - not when the
   * customer agrees. A proposal the customer turned down still moved their day
   * around, and counting only approvals would let a worker re-ask until one
   * stuck, which is the behaviour the cap exists to stop.
   */
  rescheduleCount: number;
  pendingReschedule?: RescheduleRequest;
  history: BookingHistoryEntry[];
}

/**
 * The append-only reliability ledger's event kinds.
 *
 * EXPIRED carries zero scoring weight and is recorded anyway, because it is the
 * evidence behind responseRate. An event that changes no score is still a fact
 * about what happened.
 */
export type ReliabilityEventType =
  | 'ON_TIME'
  | 'LATE'
  | 'NO_SHOW'
  | 'LATE_CANCEL'
  | 'EXPIRED';

/**
 * The cached, derived reputation figures for one kaarigar.
 *
 * DERIVED, NOT AUTHORED. Every field is recomputed from the reviews collection
 * and the reliability ledger; none of it is writable by the worker it describes,
 * which is the same rule TrustScore already follows.
 *
 * `reliability` and `responseRate` are FRACTIONS IN 0..1. `avgStars` is 1..5.
 *
 * THERE IS ONE PUBLIC SCORE AND IT IS TrustScore, the 0..100 rubric above.
 * This interface supplies the evidence behind it: `reliability` is what the
 * ledger feeds into TrustScoreComponents.reliabilityRecord, and the on-time /
 * late / no-show counts and response rate are shown beside the rubric as their
 * own line. None of them is a competing headline number.
 */
export interface WorkerStats {
  avgStars: number;                 // 1..5
  reviewCount: number;
  reliability: number;              // 0..1
  /**
   * @deprecated Not computed and not displayed. Kept only because §3 of the
   * brief names it, so its absence would read as an omission rather than a
   * decision.
   *
   * This was the 0.6·stars + 0.4·reliability blend, on a 0..1 scale. It is not
   * used: the passport and /p/:handle already publish TrustScore.value on a
   * 0..100 scale with six named components, and a second number also called a
   * trust score - differently scaled, differently derived - is a question a
   * judge would be right to ask and nobody could answer well. Reliability
   * reaches the published score through reliabilityRecord instead.
   *
   * Do not populate this. Read TrustScore.value.
   */
  trustScore: number;               // 0..1 — unused; see above
  responseRate: number;             // 0..1, over the last 90 days
  onTime: number;
  late: number;
  noShow: number;
  updatedAt: string;                // ISO 8601
}

// ===========================================================================
// END: Booking commitments & reliability
// ===========================================================================
