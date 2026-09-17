# Kaarigar — Booking Commitments & Reliability Score

> **Brief for Claude Code.** Implement this in the Kaarigar repo (`github.com/deepindersinghbti/Kaarigar`, branch `main`).
> Work **phase by phase**. After each phase, **stop and report** using the checkpoint checklist. Do not start the next phase until I confirm.

---

## 0. Context

**Product.** Kaarigar is a dashboard and digital passport for blue-collar workers (mistris).

- There are **exactly two roles: `customer` and `kaarigar`**.
- There is no admin, verifier, or contractor role. Do not add one.

**Stack.**

- Frontend: React 19 SPA, Vite 6, Tailwind v4, TypeScript. There is no router; screens are switched with tab state.
- Screens: HomeDashboard, DigitalPassport, JobsView, KamaiView, ProfileView.
- Backend: Express 4 in `server.ts`, run with tsx.
- Data: MongoDB persistence and auth already exist. Inspect how they are wired and reuse them; do not introduce a second DB layer or ORM.
- Tooling: Bun lockfile.

**Deployment.** Render free tier. **The server sleeps when idle.** In-process timers (`setTimeout`, `node-cron`, `setInterval`) are therefore **not reliable** and must not be used for deadlines.

**Shared contract.** `src/types.ts` is a frozen contract shared by three work tracks.

- Only add new types. Do not rename or change existing ones.
- Put all additions in a clearly marked block.

**UI rules.**

- The team likes the current UI. **Do not restyle existing screens.**
- New UI must match the existing look: simple, non-flashy, readable for a low-literacy user, English UI text.

### Goal (from a mentor)

The mentor raised two questions:

- What is the maximum time a Kaarigar has to accept a customer request?
- If a Kaarigar says "I'll come tomorrow" and shows up 3 days later, or never, what happens?

The answer: that behaviour should lower the Kaarigar's visible rating.

### Design decisions (already made — follow them)

1. **Two scores.**
   - **Quality** is the average of customer stars.
   - **Reliability** is computed automatically from an event ledger.
   - The displayed **Trust score** is `0.6 * quality_normalised + 0.4 * reliability`.
   - Do **not** alter how star ratings are stored.
2. **Accepting means committing to a concrete time slot.** The Kaarigar picks `slotStart` and `slotEnd`.
3. **Arrival is proven with a 4-digit OTP.**
   - The OTP is shown in the customer's view.
   - The Kaarigar enters it on arrival.
   - Store only a hash, never the plain OTP.
4. **Deadlines are enforced two ways:**
   - (a) **Check on read.** Any fetch of a booking applies overdue transitions first.
   - (b) **Sweeper.** A secret-protected `POST /api/internal/sweep` endpoint is called every 10 min by an external cron.
5. **Every state transition is atomic.**
   - Use a conditional `findOneAndUpdate` that includes the expected current `status` in the filter.
   - The penalty ledger has a unique index, so a penalty can never be applied twice.

---

## 1. Booking state machine

```
REQUESTED ──accept(slot)──► ACCEPTED ──checkin(OTP)──► ARRIVED ──complete──► COMPLETED
   │                          │
   ├─ now > acceptBy ─► EXPIRED
   ├─ decline ───────► DECLINED
   ├─ customer cancel ► CANCELLED_BY_CUSTOMER
   │                          ├─ now > arriveBy, no check-in ─► LATE
   │                          │     └─ checkin(OTP) ─► ARRIVED   (late arrival)
   │                          │     └─ now > arriveBy + 24h ─► NO_SHOW  (terminal)
   │                          ├─ reschedule (max 1, ≥12h before slotStart, customer must approve) ─► ACCEPTED (new slot)
   │                          ├─ kaarigar cancel ─► CANCELLED_BY_KAARIGAR
   │                          ├─ customer cancel ─► CANCELLED_BY_CUSTOMER
   │                          └─ customer "didn't arrive" (only after arriveBy) ─► LATE (same as timer path)
```

### Constants

Put these in one config module (for example `server/bookingConfig.ts`) and allow env overrides.

| Name | Default | Meaning |
|---|---|---|
| `ACCEPT_WINDOW_URGENT_MIN` | 30 | Deadline to accept an urgent request |
| `ACCEPT_WINDOW_NORMAL_MIN` | 240 | Deadline to accept a normal request |
| `ARRIVAL_GRACE_MIN` | 60 | `arriveBy = slotEnd + grace` |
| `NO_SHOW_AFTER_MIN` | 1440 | LATE becomes NO_SHOW after this long past `arriveBy` |
| `RESCHEDULE_MIN_NOTICE_H` | 12 | Minimum notice for a penalty-free reschedule |
| `LATE_CANCEL_NOTICE_H` | 12 | A cancel with less notice counts as a late cancel |
| `MAX_RESCHEDULES` | 1 | Reschedules allowed per booking |
| `OTP_MAX_ATTEMPTS` | 5 | After this many wrong OTPs, check-in locks for 15 min |

### Transition rules

| Transition | Who | Allowed when |
|---|---|---|
| accept | kaarigar | `REQUESTED` and `now <= acceptBy`, with `slotStart > now` and `slotEnd > slotStart` |
| decline | kaarigar | `REQUESTED` |
| checkin | kaarigar | `ACCEPTED` or `LATE`; the OTP must match |
| complete | kaarigar or customer | `ARRIVED` |
| reschedule request | kaarigar | `ACCEPTED`, and `rescheduleCount < MAX` |
| reschedule approve/reject | customer | a reschedule request is pending |
| cancel | either party | a non-terminal status |
| report no-arrival | customer | `ACCEPTED` and `now > arriveBy` |

Every transition appends to `booking.history[]` as `{ from, to, by, at, note? }`.

---

## 2. Reliability events & scoring

### Ledger entries

`reliabilityEvents` is an **append-only** collection. Documents are never updated or deleted.

| Event type | Written when | Weight |
|---|---|---|
| `ON_TIME` | check-in at or before `arriveBy` | +1 |
| `LATE` | booking enters `LATE` | −0.5 |
| `NO_SHOW` | booking enters `NO_SHOW` | −3 |
| `LATE_CANCEL` | kaarigar cancels with less than `LATE_CANCEL_NOTICE_H` notice | −1 |
| `EXPIRED` | request expired without a response | 0 |

About `EXPIRED`: it has zero weight because it only feeds a `responseRate` stat, not reliability.

Other cases that write **no event**:

- A kaarigar cancel with enough notice.
- A reschedule within the rules.
- Any customer cancel.

**No double penalty.** A LATE booking that later becomes NO_SHOW keeps both events; that is intended. But a LATE booking that later checks in does **not** get an `ON_TIME` event.

**Idempotency.** Create a unique index on `{ bookingId: 1, type: 1 }`. Treat duplicate-key errors on insert as success.

### Scoring function

Implement this as a **pure function** with unit tests.

```ts
const WEIGHT = { ON_TIME: 1, LATE: -0.5, LATE_CANCEL: -1, NO_SHOW: -3, EXPIRED: 0 } as const;
const PRIOR = 0.8, PRIOR_N = 5, HALF_LIFE_DAYS = 45;

export function computeReliability(events: { type: keyof typeof WEIGHT; at: number }[], now = Date.now()): number {
  let good = PRIOR * PRIOR_N, total = PRIOR_N;
  for (const e of events) {
    const v = WEIGHT[e.type];
    if (v === 0) continue;
    const w = Math.pow(0.5, (now - e.at) / 86_400_000 / HALF_LIFE_DAYS);
    if (v > 0) good += w * v;
    total += w * Math.abs(v);
  }
  return Math.min(1, Math.max(0, good / total));
}
```

### Other derived stats

- `trustScore = 0.6 * (avgStars / 5) + 0.4 * reliability`. If there are no reviews yet, use `avgStars = 4`.
- `responseRate = (accepted + declined) / (accepted + declined + expired)`,
  computed over the last 90 days. **Corrected from the original
  `accepted / (...)` - see D10 in the decisions log.** A decline is a
  response; only silence lowers this number.

### Caching

Cache everything on the user document as:

```ts
stats: { avgStars, reviewCount, reliability, trustScore, responseRate, onTime, late, noShow, updatedAt }
```

Recompute this cache after every ledger insert and after every new review.

---

## 3. Data model

### Additions to `src/types.ts`

Add these in a marked block. Adapt the ID types to the existing conventions.

```ts
// ===== Booking commitments & reliability (added) =====
export type BookingStatus =
  | 'REQUESTED' | 'ACCEPTED' | 'ARRIVED' | 'COMPLETED' | 'LATE' | 'NO_SHOW'
  | 'EXPIRED' | 'DECLINED' | 'CANCELLED_BY_CUSTOMER' | 'CANCELLED_BY_KAARIGAR';

export interface BookingHistoryEntry { from: BookingStatus | null; to: BookingStatus; by: 'customer' | 'kaarigar' | 'system'; at: string; note?: string; }

export interface RescheduleRequest { slotStart: string; slotEnd: string; reason?: string; requestedAt: string; }

export interface Booking {
  id: string;
  customerId: string;
  kaarigarId: string;
  jobTitle: string;
  description?: string;
  address?: string;
  urgent: boolean;
  status: BookingStatus;
  createdAt: string;
  acceptBy: string;
  slotStart?: string;
  slotEnd?: string;
  arriveBy?: string;
  arrivedAt?: string;
  completedAt?: string;
  rescheduleCount: number;
  pendingReschedule?: RescheduleRequest;
  history: BookingHistoryEntry[];
  // server-only: otpHash, otpAttempts, otpLockedUntil — never sent to clients
}

export type ReliabilityEventType = 'ON_TIME' | 'LATE' | 'NO_SHOW' | 'LATE_CANCEL' | 'EXPIRED';

export interface WorkerStats {
  avgStars: number; reviewCount: number;
  reliability: number; trustScore: number; responseRate: number;
  onTime: number; late: number; noShow: number; updatedAt: string;
}
```

### MongoDB indexes

- `bookings`
  - `{ status: 1, acceptBy: 1 }`
  - `{ status: 1, arriveBy: 1 }`
  - `{ kaarigarId: 1, createdAt: -1 }`
  - `{ customerId: 1, createdAt: -1 }`
- `reliabilityEvents`
  - `{ bookingId: 1, type: 1 }` **unique**
  - `{ kaarigarId: 1, at: -1 }`

### OTP handling

- Generate the OTP at accept time.
- Store `sha256(otp + bookingId)` on the booking.
- Return the plain OTP **only** to the customer, via `GET /api/bookings/:id/otp`.
- Never include the OTP or its hash in any kaarigar-facing response.

---

## 4. API

All routes are JSON and go through the existing auth middleware. Role checks run on every route.

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/api/bookings` | customer | body: `kaarigarId, jobTitle, description?, address?, urgent`; server sets `acceptBy` |
| GET | `/api/bookings?role=me` | both | lists own bookings; applies overdue transitions first |
| GET | `/api/bookings/:id` | participant | applies overdue transitions first |
| GET | `/api/bookings/:id/otp` | customer | only while `ACCEPTED` or `LATE` |
| POST | `/api/bookings/:id/accept` | kaarigar | body: `slotStart, slotEnd` |
| POST | `/api/bookings/:id/decline` | kaarigar | |
| POST | `/api/bookings/:id/checkin` | kaarigar | body: `otp`; rate-limited by `OTP_MAX_ATTEMPTS` |
| POST | `/api/bookings/:id/complete` | participant | |
| POST | `/api/bookings/:id/reschedule` | kaarigar | body: `slotStart, slotEnd, reason?` |
| POST | `/api/bookings/:id/reschedule/respond` | customer | body: `approve: boolean` |
| POST | `/api/bookings/:id/cancel` | participant | body: `reason?` |
| POST | `/api/bookings/:id/report-no-arrival` | customer | |
| GET | `/api/workers/:id/stats` | public | returns `WorkerStats`; this is what the passport and QR page show |
| POST | `/api/internal/sweep` | secret header | header `x-sweep-secret` must equal `SWEEP_SECRET`; otherwise return 404 |

### Implementation requirements

- **One transition module.** Put all transitions in a single module (for example `server/bookings/transitions.ts`). Each transition is one atomic `findOneAndUpdate` whose filter includes the expected `status` and the time condition.
  - If the update returns `null`, respond `409` with the booking's current state.
  - Routes must never set `status` directly.
- **Shared overdue logic.** `applyOverdue(bookingOrQuery)` is used by both the reads and the sweeper. It handles:
  - `REQUESTED` → `EXPIRED` when past `acceptBy`
  - `ACCEPTED` → `LATE` when past `arriveBy`
  - `LATE` → `NO_SHOW` when past `arriveBy + NO_SHOW_AFTER_MIN`
- **Sweeper.**
  - Processes in batches of 200 or fewer.
  - Returns counts: `{ expired, late, noShow }`.
  - Is idempotent, so calling it twice in a row changes nothing the second time.
- **Time.**
  - Use server time only. Store timestamps as `Date` in Mongo and serialise them as ISO strings.
  - Inject a `now()` function so tests can control time.
- **Validation.**
  - Reject slots in the past.
  - Reject slots longer than 12 h.
  - Reject slots more than 14 days ahead.
- **Documentation.** Add `SWEEP_SECRET` to `.env.example`. Document the external cron setup (cron-job.org or a GitHub Actions `schedule` workflow hitting the endpoint every 10 min) in `docs/SWEEPER.md`.
  - If you use GitHub Actions, add the workflow file but read the secret from repo secrets.
  - Never commit real secrets.

---

## 5. Frontend

### Kaarigar side (existing app)

**JobsView: incoming requests.** Each card shows:

- a countdown to `acceptBy`
- an **Accept** button, which opens a simple slot picker (date plus a time window, for example preset 2-hour windows)
- a **Decline** button

**JobsView: accepted jobs.** Each card shows:

- the slot
- a countdown to `arriveBy`
- an **"I've arrived — enter code"** button that opens a 4-digit OTP input
- **Reschedule** (only when allowed) and **Cancel** buttons

If a cancel would count as a late cancel, show a plain warning first: *"Cancelling now will lower your reliability score."*

**LATE state.** Show a clear banner: *"You are late. Reach the customer and enter their code."*

**DigitalPassport and the public QR page.** Show:

- Trust score
- stars
- a Reliability % bar
- on-time / late / no-show counts
- response rate

Use the `/api/workers/:id/stats` endpoint.

### Customer side (minimal, not yet built)

Keep this small. It is for the demo.

- **Customer entry.** Build a minimal customer mode using the existing auth `customer` role.
  - It may be a separate tab set rendered when the logged-in user is a customer.
  - Do not add a router unless one is already present.
- **Request a Kaarigar.** A form with job title, description, and an urgent toggle. Picking a Kaarigar from a simple list is fine.
- **My bookings.** Shows status and the slot.
  - While the booking is `ACCEPTED` or `LATE`, show the **arrival code** prominently.
  - Show **"Kaarigar didn't arrive"** only after `arriveBy`.
  - Show approve/reject for a pending reschedule.
  - Show **Mark complete** and the existing review flow once the booking is `ARRIVED`.

### Offline behaviour

If the existing localStorage outbox pattern is used for mutations, route booking actions through it. Accept, checkin, and cancel must surface `409` conflicts to the user in plain language, for example: *"This request has already expired."*

---

## 6. Tests

Use whatever test runner fits the repo; `bun test` is fine. Add a `test` script.

**Scoring tests**

- `computeReliability`:
  - with no events it returns 0.8
  - one NO_SHOW today lowers it noticeably but not to 0
  - an old NO_SHOW (180 days) has little effect
  - the result is clamped to the range 0–1

**Transition tests** (with an injected `now`)

- **Expiry and lateness**
  - a request expires after `acceptBy`, and accept then returns 409
  - ACCEPTED becomes LATE after `arriveBy`; checkin with the right OTP then gives ARRIVED with no `ON_TIME` event
  - LATE becomes NO_SHOW after 24 h, and exactly one `NO_SHOW` event exists
- **Check-in**
  - an on-time checkin writes exactly one `ON_TIME` event
  - a wrong OTP 5 times locks check-in
- **Reschedule and cancel**
  - a reschedule with less than 12 h notice is rejected
  - a second reschedule is rejected
  - a late cancel by the kaarigar writes `LATE_CANCEL`
  - a customer cancel writes nothing
- **Concurrency and the sweeper**
  - two concurrent sweeps produce each event only once
  - `report-no-arrival` before `arriveBy` returns 400
- **Access control**
  - a kaarigar can never receive the OTP or its hash in any response
  - customers can't call kaarigar routes, and vice versa

If an in-memory Mongo such as `mongodb-memory-server` is heavy to add, test the transition logic against the real dev DB using a test-prefixed database name. Say which approach you chose.

---

## 7. Phases & checkpoints

After each phase, report:

- files changed
- commands you ran
- test output
- anything you had to assume

Then **wait for my confirmation**.

### Phase 1 — Recon & contract

**Tasks**

- Read `server.ts`, the auth code, the Mongo setup, `src/types.ts`, and JobsView/DigitalPassport.
- Summarise how auth, roles, and DB access currently work.
- Add the type block to `src/types.ts`.

**Checkpoint:** `bun run build` (or the existing typecheck) passes. Your summary explicitly flags any mismatch with this brief, for example if roles are stored differently.

### Phase 2 — Backend core

**Tasks**

- Config module, transition module, and `applyOverdue`.
- Routes, OTP handling, and indexes.
- `computeReliability` and the stats cache.
- Tests from §6.

**Checkpoint:** all tests pass. You also show a curl walkthrough of these paths:

- REQUESTED → ACCEPTED → ARRIVED → COMPLETED
- a forced LATE → NO_SHOW (by temporarily lowering the constants through env vars)

### Phase 3 — Sweeper & ops

**Tasks**

- The internal sweep endpoint.
- `docs/SWEEPER.md`.
- The optional GitHub Actions workflow.
- The `.env.example` update.

**Checkpoint:** show two sweep calls in a row on seeded overdue data. The first returns non-zero counts and the second returns zeros. A wrong secret returns 404.

### Phase 4 — Kaarigar UI

**Tasks:** the JobsView changes and the DigitalPassport/QR stats.

**Checkpoint:** screenshots or a description of each new state (incoming, accepted, late, arrived). You confirm that no existing screen styling was changed.

### Phase 5 — Customer UI (minimal)

**Tasks:** the customer mode from §5.

**Checkpoint:** you describe an end-to-end demo script I can run on the deployed app with two accounts, one customer and one kaarigar, covering:

- request → accept → OTP check-in → complete → review
- a demo of the LATE state (using short env-configured windows on a demo flag)

---

## 8. Guardrails

- Do not change existing type names, existing routes, or existing screen styling.
- Do not add admin/verifier roles, payments, GPS, or push notifications. These are out of scope for now.
- Do not use in-process timers for deadlines.
- Never expose the OTP, its hash, or another user's private data in any response.
- Keep diffs focused. If something in this brief conflicts with the actual code, **stop and ask** rather than guessing.
- At the end, add a short `docs/RELIABILITY.md` explaining the scoring in plain language. The team will use it to answer judges' questions.

---

## 9. Decisions log

> Recorded after the Phase 1 recon, which found that several premises in §0–§8
> did not match the repository. These decisions are the resolution and they
> **override the sections above wherever the two disagree.** Where a section is
> not mentioned here, it stands as written.

### 9.1 Product decisions

**D1 — One request flow. A booking wraps a job.**
The existing customer job flow is the only way to request a kaarigar. There is
no second "request" button and no parallel pipeline. `POST /api/customer/jobs`
creates a `JobItem` exactly as it does today and a `Booking` alongside it,
linked by the new optional `Booking.jobId`. `JobItem` is **not** modified.

- The **job** owns the price conversation: `REQUESTED → QUOTED → ACCEPTED`,
  counter-offers, `agreedPrice`.
- The **booking** owns the appointment: deadlines, slot, arrival, lateness.
- A worker's own job (no `customerId`) gets **no booking**. There is no
  counterparty to commit a slot to, and the one-tap path stays as it is.

**D2 — `acceptBy` is the deadline for the kaarigar's FIRST RESPONSE**, not for
a slot commitment. A quote or a decline satisfies it. Missing it expires the
request and writes an `EXPIRED` event, which feeds `responseRate` only and
carries zero scoring weight.

**D3 — The slot is committed at `SCHEDULED`, not at accept.**
`ACCEPTED → SCHEDULED` on the worker's transition route now **requires**
`slotStart` and `slotEnd`. Taking that edge sets `arriveBy`, generates the
4-digit check-in OTP, and starts the LATE / NO_SHOW clocks. Before it, a
booking has no `arriveBy` and therefore cannot go LATE.

**D4 — One public score: the existing 0–100 `TrustScore`.**
The reliability ledger feeds `TrustScoreComponents.reliabilityRecord` and
**replaces** the cancellation-rate source there (see §9.5 for the formula and
the reasoning). Shown separately, beside the rubric, on both `DigitalPassport`
and `/p/:handle`: a **Reliability %** line, on-time / late / no-show counts, and
response rate. `WorkerStats.trustScore` stays in the contract, marked
`@deprecated`, uncomputed and undisplayed.

**D5 — Reviews are untouched.** The four axes stay as they are, `punctuality`
included. `avgStars` is `ReviewSummary.average` (the existing mean of the four
axis means, 1–5). The existing **3.5 prior with weight 3** stands; the brief's
`avgStars = 4` default is dropped. There is no new quality blend — §2's
`0.6·quality + 0.4·reliability` is superseded by D4.

**D6 — The demo customer is sufficient.** Identity, signup and role assignment
are not touched. The LATE demo runs on env-shortened windows.

### 9.2 Implementation decisions

**D7 — Check-in OTPs use a separate `CHECKIN_OTP_SECRET`**, HMAC-SHA256, the
same construction as `hashOtp()` in `src/server/auth/tokens.ts`. Not
`sha256(otp + bookingId)`: an unkeyed hash of a 4-digit code with a known
booking id is 10,000 offline guesses if the database leaks. A separate secret
rather than `JWT_SECRET` because CLAUDE.md forbids rotating that one, and a
third mechanism depending on it makes that harder still. Added to `.env.example`.

**D8 — External cron only.** `POST /api/internal/sweep`, header
`x-sweep-secret`, driven by cron-job.org every 10 minutes. **No GitHub Actions
workflow file** — `.github/workflows/keep-warm.yml` already records why a
`schedule:` was rejected on cost (a 15-minute cadence consumes ~1,950 of 2,000
free minutes/month on this private repo; 10 minutes is roughly double that).
The endpoint answers **404 on a wrong or missing secret** and the standard
**503** when the database is not yet connected — a cold Render free instance
takes ~50s to boot, and that must not be indistinguishable from a bad secret.

**D10 — `responseRate` counts a decline as a response.**
`(accepted + declined) / (accepted + declined + expired)`, correcting §2's
`accepted / (...)`. As written the formula was an ACCEPTANCE rate wearing the
word "response", and it punished the most useful thing a busy kaarigar can do:
say no, quickly, so the customer can ask someone else. Only silence lowers it.

**D9 — All new UI strings go into the existing copy tables.** No English-only
strings. Every new key is listed in the Phase 2a report for native-speaker
review of `hi` and `pa`.

Coverage is **not uniform**, and each table must be filled to its own depth:

| Table | Languages | Note |
|---|---|---|
| `src/data/translations.ts` — `TRANSLATIONS` | all 5 (`hi pa kn mr en`) | `Record<SupportedLanguage, …>` |
| `src/data/uiCopy.ts` — `JobsCopy`, `PassportCopy` | **3** (`hi pa en`) | `getScreenCopy` falls `kn`/`mr` back to `hi` |
| `src/components/customer/customerCopy.ts` — `CUSTOMER_COPY` | all 5 | `Record<SupportedLanguage, CustomerCopy>` |

All three are typed as complete records or interfaces, so a **missing
translation is a compile error**, not a silent English fallback. (The silent
fallback CLAUDE.md warns about is `getCustomerTrade`, which looks up a *dynamic*
trade string — a different mechanism, and not one this feature adds to.)

### 9.3 Accepted corrections to §0–§8

Each of these replaces the corresponding statement in the brief.

| § | Brief said | Correction |
|---|---|---|
| §0 | Bun lockfile; `bun run build`, `bun test` | npm. Typecheck is `npm run lint` (`tsc --noEmit`); build is `npm run build`. |
| §0/§5 | No router; tab state | `react-router-dom` 7 is present and load-bearing. Use the existing routes. |
| §5 | Customer side not yet built | It is built (`CustomerApp`, `CustomerBrowse`, `CustomerRequestForm`, `CustomerRequests`, `/api/customer`). Phase 5 extends it. |
| §5 | English UI text | Superseded by D9. |
| §6 | `mongodb-memory-server` | Not installed, and no new dependencies. Follow the existing pattern: a uniquely-named throwaway database, `node:assert/strict`, `tsx`. |
| §4 | Role checks on every route | Role gates are **prefix mounts** in `routes/index.ts`, ahead of the routers. `/api/bookings` serves both roles, so it takes `requireAuth` at the prefix and `requireRole(...)` per route inside — documented at the mount site as the deviation it is. |
| §4 | `GET /api/bookings?role=me` | The filter is derived from `req.user.roles`, never from the query string. |
| §4 | `GET /api/workers/:id/stats` | `GET /api/workers/:handle/stats`. The public surface is keyed by `passportHandle`; it has never exposed a user id. |
| §4 | `POST /api/bookings` takes `kaarigarId` | Superseded by D1 — there is no `POST /api/bookings`. The existing `POST /api/customer/jobs` takes `kaarigarHandle` and resolves the uid server-side. |
| §3 | Collection `reliabilityEvents` | `reliability_events`. Every collection in this repo is lowercase snake_case. |
| §3 | — | Mongo returns an absent optional number as `null`, not `undefined`. Read every optional booking number with a `typeof` guard (CLAUDE.md). |
| §2 | `OTP_MAX_ATTEMPTS` | Named `CHECKIN_OTP_MAX_ATTEMPTS`. `OTP_MAX_ATTEMPTS` already exists in `auth/tokens.ts` for login OTPs. |
| §4 | Timestamps as `Date` in Mongo, ISO on the wire | Accepted. `acceptBy` / `arriveBy` need indexed range queries, which strings do badly. Contract types stay ISO strings. |
| §2 | `computeReliability(events: { at: number })` | Kept on epoch ms — correct for a decay calculation — with an explicit conversion at the single call site. Epoch ms never enters the contract. |
| §3 | `BookingHistoryEntry.by` is a role | Kept as a role, diverging from `JobStateTransition.by` (a user id). A booking already names both parties, and the sweeper has no uid — that is what `'system'` is for. |
| §5 | Route booking actions through the outbox | The outbox handles **creates only** (`job`, `ledger_entry`) and `transitionJob` already bypasses it. The conditional is false: booking actions are direct calls, and 409s surface inline as `JobsView.transitionError` does today. |
| §7 | — | **Every server-side refusal needs its UI branch in `JobsView`** (CLAUDE.md). Each gate added in Phase 2 gets its screen branch in Phase 4 and a case in the worker rehearsal. |

### 9.4 Job ↔ Booking state mapping

`BookingStatus` was split and renamed after the first draft of this table. There
is no booking status called `ACCEPTED`, because three different facts were
competing for the word:

| Fact | Where it lives now |
|---|---|
| the customer agreed the price | `JobState.ACCEPTED` |
| the kaarigar replied inside `acceptBy` | `BookingStatus.RESPONDED` |
| the kaarigar named a time slot | `BookingStatus.COMMITTED` |

Only `REQUESTED` and `COMPLETED` are now spelled the same in both unions, and
both still mean different things. This table is the authority.

#### Extra constant

| Name | Default | Meaning |
|---|---|---|
| `SCHEDULE_WINDOW_MIN` | 1440 | Deadline to choose a slot, armed when the price is agreed |

#### Which job states have a running deadline

| Job state | Booking status | Waiting on | Deadline running |
|---|---|---|---|
| `REQUESTED` *(new)* | `REQUESTED` | kaarigar | **`acceptBy`** → `EXPIRED` |
| `QUOTED` | `RESPONDED` | **customer** | *none* |
| `REQUESTED` *(counter pending)* | `RESPONDED` | either, mid-haggle | *none* |
| `ACCEPTED` | `RESPONDED` | kaarigar | **`scheduleBy`** → `EXPIRED` |
| `SCHEDULED` | `COMMITTED` | kaarigar | **`arriveBy`** → `LATE` → `NO_SHOW` |
| `IN_PROGRESS` | `ARRIVED` | kaarigar | *none* |
| `COMPLETED` | `COMPLETED` | customer | *none* |
| `SETTLED` / `REVIEWED` / `DISPUTED` | terminal or `COMPLETED` | — | *none* |

**No deadline ever runs while the ball is in the customer's court.** That is not
enforced by a check — it falls out of the data. `scheduleBy` is *armed only* when
the job reaches `ACCEPTED`, so a quoted or countered booking simply has no
`scheduleBy` field for `{ status: 'RESPONDED', scheduleBy: { $lte: now } }` to
match. Same shape as `arriveBy`, which exists only from `COMMITTED`.

#### Job transitions that drive a booking transition

| Job edge | Actor | Booking edge | Event |
|---|---|---|---|
| *(create, customer-linked)* → `REQUESTED` | customer | *(create)* → `REQUESTED` | — |
| `REQUESTED → QUOTED` | kaarigar | `REQUESTED → RESPONDED` | — |
| `REQUESTED → CANCELLED` | kaarigar | `REQUESTED → DECLINED` | — |
| `QUOTED → REQUESTED` *(decline / counter)* | customer | *none — stays `RESPONDED`* | — |
| `QUOTED → ACCEPTED` *(price agreed)* | customer | *stays `RESPONDED`*; **arms `scheduleBy`** = now + `SCHEDULE_WINDOW_MIN` | — |
| `ACCEPTED → SCHEDULED` *(slot required)* | kaarigar | `RESPONDED → COMMITTED`; sets `slotStart`, `slotEnd`, `arriveBy`, `otpHash`; clears `scheduleBy` | — |
| `SCHEDULED → IN_PROGRESS` *(OTP required)* | kaarigar | `COMMITTED → ARRIVED` | **`ON_TIME`** +1 |
| `SCHEDULED → IN_PROGRESS` *(OTP required)* | kaarigar | `LATE → ARRIVED` | *none — the `LATE` event stands* |
| `IN_PROGRESS → COMPLETED` | kaarigar | `ARRIVED → COMPLETED` | — |
| `COMPLETED → SETTLED` | customer | *none — booking already terminal* | — |
| `COMPLETED → DISPUTED` | customer | *none* | — |
| `DISPUTED → IN_PROGRESS` | kaarigar | *none* | — |
| `SETTLED → REVIEWED` | — | *none* | — |
| `any → CANCELLED`, booking **not** `LATE` | kaarigar | `→ CANCELLED_BY_KAARIGAR` | **`LATE_CANCEL`** −1 *only if* a slot exists and `now > slotStart − LATE_CANCEL_NOTICE_H`; else none |
| `any → CANCELLED`, booking **is** `LATE` | kaarigar | `LATE → NO_SHOW` | **`NO_SHOW`** −3 *(not `LATE_CANCEL`)* |
| `any → CANCELLED`, booking **not** `LATE` | customer | `→ CANCELLED_BY_CUSTOMER` | *never* |
| `any → CANCELLED`, booking **is** `LATE` | customer | `LATE → NO_SHOW` | **`NO_SHOW`** −3 *(against the kaarigar; the customer is charged nothing)* |

**Cancelling out of `LATE` is a no-show, whoever presses the button.** The
kaarigar was already overdue when the cancel arrived, so calling it a late
cancel would let someone who never turned up pay −1 instead of −3 by tapping
Cancel on their way past the deadline. And when the *customer* gives up on a
kaarigar who is already late, that is the clearest no-show there is — the
customer waited and then stopped waiting. The earlier `LATE` event stands in
both cases; §2 is explicit that a booking which goes `LATE` then `NO_SHOW` keeps
both, and the customer never receives an event of any kind.

#### Reschedule

A reschedule never leaves `COMMITTED`. The OTP is **not** regenerated — the code
the customer is holding stays valid across the change, because reissuing it
would silently invalidate a code already written on a scrap of paper.

| Operation | Who | Allowed when | Effect | Event |
|---|---|---|---|---|
| reschedule request | kaarigar | `COMMITTED`, `rescheduleCount < MAX_RESCHEDULES`, `now ≤ slotStart − RESCHEDULE_MIN_NOTICE_H`, none already pending | sets `pendingReschedule`, **increments `rescheduleCount`** | — |
| reschedule approve | customer | a request is pending | new `slotStart`/`slotEnd`, recomputed `arriveBy`, clears `pendingReschedule`; `otpHash` untouched | — |
| reschedule reject | customer | a request is pending | clears `pendingReschedule`; the original slot stands | — |
| **auto-reject** | *system* | a request is still pending at the **original `slotStart`** | clears `pendingReschedule`; the original slot and `arriveBy` stand; **`rescheduleCount` stays spent** | — |

`rescheduleCount` counts **attempts, not approvals** — see the note on the field
in `types.ts`. A rejected proposal still moved the customer's day around, and
counting approvals only would let a worker re-ask until one stuck.

#### Customer-reported non-arrival

| Operation | Who | Allowed when | Effect | Event |
|---|---|---|---|---|
| report no-arrival | customer | `COMMITTED` **and** `now > arriveBy` | `COMMITTED → LATE`; **job unchanged** | **`LATE`** −0.5 |

Identical in every respect to the timer path, which is the point: whether
lateness is noticed by the sweeper or by the person standing in their doorway,
it is the same fact and produces the same single event. Before `arriveBy` it is
refused — the kaarigar still has time.

#### Time-driven transitions (`applyOverdue` — read path and sweeper)

No job edge triggers these. Job side-effects are written with
`stateHistory.by = 'system'`, a literal string no uid collides with. The rules
run **in the order listed**, so one sweep can take a booking `COMMITTED → LATE →
NO_SHOW` and correctly leave both events behind.

| # | Booking edge | Condition | Job side-effect | Event |
|---|---|---|---|---|
| 0 | `COMMITTED → COMMITTED` *(proposal closed)* | `pendingReschedule` set **and** `now > slotStart` | *none* | *none* |
| 1 | `REQUESTED → EXPIRED` | `now > acceptBy` | `REQUESTED → CANCELLED` | **`EXPIRED`** 0 |
| 2 | `RESPONDED → EXPIRED` | `now > scheduleBy` | `ACCEPTED → CANCELLED` | **`LATE_CANCEL`** −1 |
| 3 | `COMMITTED → LATE` | `now > arriveBy` | *none — job stays `SCHEDULED`* | **`LATE`** −0.5 |
| 4 | `LATE → NO_SHOW` | `now > arriveBy + NO_SHOW_AFTER_MIN` | `SCHEDULED → CANCELLED` | **`NO_SHOW`** −3 |

**`EXPIRED` is reachable two ways and they write different events.** Rule 1 is
"never answered" and scores nothing — it feeds `responseRate` only. Rule 2 is
"took the work, then let an agreed job rot", which is a broken commitment and
scores −1. Because the two write *different* event types, the ledger's unique
`{ bookingId, type }` key still admits both without collision, and neither can
be applied twice.

#### Properties this relies on

- **The sweeper's lateness filter is `status: 'COMMITTED'` plus `arriveBy ≤ now`.**
  Correctness rests on the *status*, not on `arriveBy` being absent — a
  `RESPONDED` booking is not a candidate no matter what its date fields hold.
- **`arriveBy` and `scheduleBy` are `$unset`, never set to `null`,** as defence in
  depth. BSON orders `null` below `Date`, so a nulled field *would* match
  `$lte`. This is the second lock on the same door, not the first.
- **`acceptBy` is never mutated.** It stops applying because the booking leaves
  `REQUESTED`.
- **A price decline or counter moves nothing.** The kaarigar answered inside the
  window; haggling afterwards is not a reliability event, and `MAX_COUNTERS = 2`
  already bounds it.
- **Every edge is one conditional `findOneAndUpdate` naming the expected status.**
  Two concurrent sweeps: one wins the move, and the unique ledger key makes the
  event idempotent regardless.

### 9.5 `reliabilityRecord` mapping (ledger → −10..0)

The cancellation-rate source is **replaced**, not combined:

```ts
// data/trustScore.ts - replaces the cancellationRate block
const reliability = computeReliability(events, now);   // 0..1, PRIOR = 0.8
const penalty = (PRIOR - reliability) / PRIOR;         // 0 at the prior, 1 at zero
const reliabilityRecord = -Math.round(Math.min(10, Math.max(0, penalty * 10)));
```

Anchored at `PRIOR`, not at 1.0, so a worker with no history scores **0** — the
"a new joiner does not start at zero" rule the reviews layer already follows.

**Why replace rather than combine.** The existing rate is
`cancelled / (completed + cancelled)` over all job outcomes, and under D1 that
becomes actively wrong: (a) it counts **customer** cancellations against the
worker, which §2 explicitly says must write nothing; (b) `EXPIRED` and `NO_SHOW`
now cancel the job, so every ledger penalty would be counted a second time as a
cancellation; (c) it has **no time decay**, so a bad week marks a worker
permanently — the opposite of what the 45-day half-life is for. `LATE_CANCEL`
carries the signal that was actually worth keeping, and carries it better.

**Accepted gap:** a kaarigar who repeatedly cancels with *ample* notice now
escapes the score entirely, where the old rate caught them. §2 requires that a
well-noticed cancel write no event, so this follows from the brief. Logged in
"Known gaps".

#### Worked examples

| # | Ledger | `w` | `good` | `total` | `reliability` | `penalty` | `reliabilityRecord` |
|---|---|---|---|---|---|---|---|
| 1 | *(empty — new worker)* | — | 4.0 | 5.0 | **0.800** | 0.000 | **0** |
| 2 | one `NO_SHOW`, today | 1.0 | 4.0 | 8.0 | **0.500** | 0.375 | **−4** |
| 3 | one `NO_SHOW`, 180 days ago | 0.0625 | 4.0 | 5.1875 | **0.771** | 0.036 | **0** |

1. **New worker.** `good = 0.8 × 5 = 4`, `total = 5`. No penalty, and none
   deserved — an empty record is not a bad one.
2. **One no-show this week.** `w = 0.5^0 = 1`; the weight is negative so `good`
   is unchanged and `total = 5 + 1×3 = 8`. Reliability 0.500, well below the
   0.800 prior but nowhere near zero: one bad visit is not a verdict.
   `penalty × 10 = 3.75 → −4`.
3. **The same no-show, six months later.** `w = 0.5^(180/45) = 0.5⁴ = 0.0625`.
   Reliability has recovered to 0.771 and `0.36` rounds to **0** — the rubric
   component has only eleven integer steps, so a residue that small cannot be
   shown there. It is still visible on the Reliability % line (77% against a
   baseline of 80%), which is the honest place for it.

**Calibration note.** `good` never falls below the 4.0 prior, so `reliability`
approaches 0 only asymptotically: −9 needs roughly ten fresh no-shows and −10 is
not reachable in practice. That is deliberate — the floor should be hard to hit
and the recovery path should always be open — but it means the component's
effective range is about −9..0, not −10..0.

### 9.6 Rule 0 — an unanswered reschedule proposal

**Silence must not be a loophole.** Without rule 0 a kaarigar could propose a new
time twelve hours out, the customer could simply not look at their phone, and
the booking would sit at the original slot with an open proposal attached — so
when the kaarigar failed to turn up, it would be genuinely unclear *which slot
they had failed to turn up to*. Lateness measured against an ambiguous slot is
not a fact worth recording.

So the proposal is closed at the original `slotStart`, and it resolves **in the
customer's favour**: they never agreed to the change. The alternative — letting
an unanswered proposal take effect — would let a worker move an appointment
unilaterally by asking at a moment they expected no reply.

`rescheduleCount` is **not refunded**. The attempt was spent when it was made:
the customer still had a proposal to consider, and a worker who could get the
allowance back by timing the ask badly would have an unlimited supply.

It writes **no event**. Proposing a reschedule within the rules is legitimate
even when nobody answers. If the kaarigar then misses the original slot, the
ordinary `LATE` and `NO_SHOW` rules do their work unchanged.

Rule 0 runs **before** the four status rules in every pass, so a single sweep can
close a stale proposal and mark the same booking late, in that order.

### 9.7 Known limitations

For `docs/RELIABILITY.md`, and for answering a judge honestly rather than
being caught out by the question.

**The arrival OTP protects the customer, not the kaarigar.** It proves a
kaarigar reached a customer who was willing to hand over a code. It proves
nothing about the reverse. A kaarigar who travels across the city to a locked
door has no way to record that they went — there is no code to collect, so the
booking stays `COMMITTED`, goes `LATE`, and eventually `NO_SHOW`. The −3 lands
on the person who did turn up.

**"The customer wasn't home" cannot be disproved without a human.** Resolving it
needs one of: a photo with a timestamp and location, a phone log, a second
party, or somebody with authority to look at both accounts and decide — and the
scope has no admin, verifier or moderator role, deliberately. Every automatic
rule we could write instead is worse than the gap: trusting the kaarigar's
claim makes the score self-asserted and therefore worthless; trusting the
customer's silence is what we already do.

**What this means in practice.** The score is honest about *observable*
behaviour — a code was entered, or it was not, by a certain time. It is not a
judgement about fault, and `docs/RELIABILITY.md` should say so in those words.
A worker with one unexplained `NO_SHOW` against a long clean record barely
moves (the 45-day half-life and the `PRIOR_N = 5` floor both work in their
favour), which is the main thing standing between an imperfect signal and an
unfair one.

**The related gaps, for completeness:**

- A `DISPUTED` job records only that the customer rejected the completion claim
  — no reason, no photo, no timeout. Unchanged by this feature.
- A kaarigar who repeatedly cancels with *ample* notice escapes the score
  entirely; §2 requires that such a cancel write no event. Previously the
  cancellation-rate source caught them, imprecisely and while also penalising
  customer cancels.
- `reliabilityRecord` cannot in practice reach −10: `good` never falls below the
  4.0 prior, so −9 needs roughly ten fresh no-shows. The effective range is
  about −9..0.
- There is no appeal, because there is nobody to appeal to.
