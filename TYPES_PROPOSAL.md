# `types.ts` — proposed expansion

**Status: PROPOSAL. Nothing here has been applied.** `src/types.ts` is unchanged at 91 lines.

This exists so the Day 1 morning session (all three, ~90 min) is a review rather than a blank page. Everything downstream waits on that session: tracks A, B and C code against this contract independently from Day 2, and a contract that moves under two of the three tracks is how parallel work turns into a merge disaster on Day 6.

Scoped to the **locked scope** in `MIGRATION_PLAN.md` Part 3, not the full architecture. No types are proposed for cut features — media, DigiLocker, e-Shram, UPI, verifiable credentials, consent artifacts, audit log, disputes, geo discovery, crew mode.

**Delete this file once the session is done and `types.ts` is frozen.**

---

## Seven decisions the session has to make

These are genuine forks. Each changes what someone writes on Day 2, so none should be settled unilaterally.

### D1 — Is the job enum 8 states or 10?

`MIGRATION_PLAN.md` Day 1 says "the 8-state job enum". Architecture §4E gives a main line of eight:

`REQUESTED → QUOTED → ACCEPTED → SCHEDULED → IN_PROGRESS → COMPLETED → SETTLED → REVIEWED`

…and then adds `CANCELLED` and `DISPUTED` as **terminal branches**, which are states a job can actually be in. So the enum needs **ten values** even though the happy path is eight.

*Proposed: ten. "8-state" describes the main line, not the enum size.* If we ship eight, a cancelled job has nowhere to sit.

### D2 — Does `JobItem.status` widen in place, or does a new field sit alongside it?

Today `status` is `'completed' | 'in_progress' | 'scheduled'` and three components render off it. Widening it to ten values is the honest model but immediately breaks any exhaustive handling in `JobsView`.

*Proposed: widen in place, and Track B maps the ten states onto the existing three badge styles.* The audit already calls this additive and says the existing badge styling survives. The alternative — `status` for display and `state` for truth — guarantees the two drift apart.

**This one is Track B's call to live with**, since B owns the components.

### D3 — Six roles, or only the two we build? — **DECIDED: two**

Architecture §3 defines six: Kaarigar, Customer, Contractor/Team Lead, Verifier, Institution/Admin, Platform Ops. The locked scope only ever authenticates a worker and, via the signed review link, a customer.

**Resolved: `'kaarigar' | 'customer'` only.** Naming four roles we neither build nor test would put aspirational values in a frozen contract, and `requireRole('verifier')` would compile while guarding nothing.

Widening a union later is an additive change that breaks no existing code, so starting narrow is the reversible direction. That is what makes this safe — it would not be if the change ran the other way.

### D4 — Does `KamaiEntry` become `LedgerEntry`?

Architecture §7 calls the collection `ledger_entries`. Our type is `KamaiEntry` and is imported by `App.tsx`, `KamaiView`, `HomeDashboard` and `VoiceAssistantModal`.

*Proposed: keep the name `KamaiEntry`, extend it in place.* A rename is a four-file change in Track B's territory on the one day B is also installing react-router, and it buys nothing but tidiness. The Mongo collection can still be `ledger_entries`.

### D5 — UUIDv7 or UUIDv4 for client-generated ids?

Architecture §7 and §9.1 both specify **UUIDv7** so that records created offline keep a stable, **sortable** identity from the moment of creation. Node's built-in `crypto.randomUUID()` is v4 — stable, but **not sortable**.

This matters more than it looks: the ledger is append-only and the outbox flushes in causal order, so id sortability is doing real work. With v4 we sort on `occurredOn`/`createdAt` and accept ties.

*Proposed: add a small v7 helper (~15 lines, no dependency) and use it for ledger entries and jobs.* Falling back to v4 is defensible but should be a decision, not an accident.

### D6 — Do `source` and `fallbackReason` go in the shared contract?

Deferred from the P1 commit. They are currently server-internal in `server.ts`. Track B's `VoiceAssistantModal` will want them typed when it wires `handleConfirm` to real endpoints on Day 5, and the demo story ("this came from Gemini, not the keyword matcher") depends on reading them.

*Proposed: yes, add them.*

### D7 — Does `AuthUser` live here or stay server-side?

Deferred from the fallback-auth commit. Currently server-internal in `src/server/auth/tokens.ts`. Track B needs `Role` for any role-aware UI and for the `AuthProvider` context on Day 2.

*Proposed: `Role` and `AuthUser` move here; the JWT claim shapes stay server-side.* Claims are an implementation detail of one auth strategy and would leak into the client contract for no benefit — especially since that strategy may still be swapped back to Firebase.

---

## Proposed additions

Existing types (`SupportedLanguage`, `LanguageOption`, `AssistantContext`, `AssistantMessage`, `VoiceAssistantSession`) are unchanged unless noted.

### Identity

```ts
export type Role =
  | 'kaarigar'
  | 'customer'
  | 'contractor'
  | 'verifier'
  | 'institution'
  | 'platform_ops';

export interface User {
  id: string;                     // client-generated UUID (see D5)
  phone: string;                  // E.164, e.g. +919876543210
  roles: Role[];
  languages?: SupportedLanguage[];
  createdAt: string;              // ISO 8601
  lastLoginAt?: string;
}

/** What requireAuth attaches to every authenticated request. */
export interface AuthUser {
  uid: string;
  phone: string;
  roles: Role[];
}
```

### Sync (Amendment 3 — localStorage outbox, WatermelonDB cut)

```ts
/**
 * Per-record sync state. Architecture §9.1: every record shows
 * pending / synced / failed, because hidden sync erodes trust in a
 * financial record. The storage engine changed; these semantics did not.
 */
export type SyncState = 'pending' | 'synced' | 'failed';
```

### Jobs

```ts
export type JobState =
  | 'REQUESTED'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SETTLED'
  | 'REVIEWED'
  | 'CANCELLED'      // terminal branch
  | 'DISPUTED';      // terminal branch

/** §4E: every transition is timestamped and immutable. */
export interface JobStateTransition {
  state: JobState;
  at: string;
  by: string;        // user id
}
```

`JobItem` gains:

```ts
  status: JobState;                      // WIDENED from 3 values (see D2)
  stateHistory: JobStateTransition[];
  syncState: SyncState;
  kaarigarId: string;
  customerId?: string;                   // free-text customerName retained for display
  agreedPrice?: number;
  bandSnapshot?: { p25: number; p50: number; p75: number };
```

### Ledger

```ts
/** §7: 'in' is money received, 'out' is money owed or spent (udhaar). */
export type LedgerDirection = 'in' | 'out';
```

`KamaiEntry` gains (see D4):

```ts
  direction: LedgerDirection;
  syncState: SyncState;
  profileId: string;
  reversesId?: string;                   // §4B: corrections are reversing
                                         // entries, never in-place edits
  occurredOn: string;                    // distinct from createdAt
  category?: string;
  settledAt?: string;                    // receivables (Day 8, cut-list #2)
```

### Passport

`WorkerProfile` gains:

```ts
  userId: string;
  passportHandle: string;                // the :handle in GET /p/:handle
  trustScore?: TrustScore;
  ncoCode?: string;                      // §4A: trade coded, not free text
```

### Reputation

```ts
export interface ReviewRatings {
  workmanship: number;      // 1–5
  punctuality: number;
  priceHonesty: number;
  cleanliness: number;
}

export interface Review {
  id: string;
  jobId: string;            // §4D: job-anchored. One review per job.
  authorId: string;
  subjectId: string;
  ratings: ReviewRatings;
  text?: string;
  response?: string;        // §4D: workers may post a public response
  createdAt: string;
}

/** §11 weights. Published rubric, not a learned model. */
export interface TrustScoreComponents {
  identityVerification: number;   // max 20
  skillCredentials: number;       // max 15
  verifiedWorkHistory: number;    // max 25
  customerRatings: number;        // max 25
  reliabilityRecord: number;      // -10 to 0
  skillingEngagement: number;     // max 5
}

export interface TrustScore {
  value: number;
  components: TrustScoreComponents;
  computedAt: string;
}
```

### Pricing

```ts
export interface RateBand {
  trade: string;
  taskCode: string;
  locality: string;
  cityTier?: string;
  p25: number;
  p50: number;
  p75: number;
  sampleN: number;          // §4C + §16: display honestly, and suppress
                            // the band entirely below a minimum count
  wageFloor: number;        // enforced server-side in pricing, not as a UI hint
  seededFrom: string;       // e.g. "CPWD DSR 2024"
  updatedAt: string;
}
```

### Assistant response (see D6)

```ts
export type AssistantSource = 'gemini' | 'fallback';

export type AssistantFallbackReason =
  | 'no_api_key'
  | 'empty_response'
  | 'invalid_json'
  | 'api_error';

export interface AssistantProcessResponse {
  replyText: string;
  isComplete: boolean;
  requiresConfirmation: boolean;
  nextStep: number;
  extractedData?: AssistantMessage['extractedData'];
  source: AssistantSource;
  fallbackReason?: AssistantFallbackReason | null;
}
```

---

## Migration impact

| Track | What changes |
|---|---|
| **B** | `JobItem.status` widens to ten values — map them onto the three existing badge styles (D2). New required fields on `JobItem` and `KamaiEntry` mean `initialData.ts` needs updating, which Track C is already rewriting for date-pinning. |
| **A** | Mongo schemas follow this directly. `AuthUser` and `Role` move out of `src/server/auth/tokens.ts`; `FallbackReason` moves out of `server.ts`. |
| **C** | `passportHandle` is the `/p/:handle` key. `Review` and `TrustScore` are the shape the review flow and passport render against. |

**Required-vs-optional is the sharp edge.** Fields marked required above will fail to compile against the existing seed data until `initialData.ts` is updated. Decide in the session which of `syncState`, `stateHistory`, `direction` and `profileId` ship as required versus optional-with-default. Making them optional is easier on Day 1 and worse on Day 6, when the outbox needs `syncState` to exist on every record.

## What is deliberately absent

No `Media`, `Credential`, `Consent`, `AuditLog`, `Dispute`, `Quote`, or `PriceObservation`. All cut. No GeoJSON — discovery search is cut, so `location` stays a display string and no 2dsphere index is possible or needed.

If any of these appear in a pull request, the scope has moved and that is a conversation, not a merge.
