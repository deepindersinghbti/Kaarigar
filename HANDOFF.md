# Kaarigar — Project Handoff

**Baseline commit:** `a44ad8b` on `main` · **Live:** https://kaarigar.onrender.com
**Written:** 30 August 2026 · **Reference architecture:** `Kaarigar_Architecture_v1.pdf` v1.0 (27 Aug 2026)

> **How to read this.** The architecture PDF is the *design*. This document is the *implementation*, written by reading the code rather than the plan. Where the two differ, the code is treated as the source of truth and the difference is called out explicitly. Anything I could not confirm is labelled **Needs verification** rather than guessed at.

---

# 1. Project Overview

## What it does

Kaarigar gives India's skilled blue-collar tradespeople — electricians, plumbers, carpenters, masons, painters — three things they don't currently have:

1. **A portable, verifiable record of skill and work history** (the Digital Kaarigar Passport)
2. **A structured record of what they earn** (the Kamai ledger)
3. **Access to transparent market rates** (the Mol-Bhav fair-price engine)

## The problem

Four failures, from §2.1 of the architecture:

| Failure | On the ground |
|---|---|
| **Invisible skill** | A mason with 15 years' experience cannot prove it in a new locality. Trust restarts at zero on every move. |
| **Invisible income** | Cash earnings mean no credit history, so no formal loan for tools or a child's education. |
| **Opaque pricing** | Neither side knows the going rate. Negotiation is adversarial; middlemen exploit the gap. |
| **Trapped reputation** | Word of mouth doesn't scale past a few streets and can't move cities or platforms. |

## Core goals

- **Identity is the product.** The dashboard, pricing engine and reviews exist to generate provable claims for the passport. Every module should answer: *what verifiable claim does this add?*
- **Zero commission from workers.** Reputation is the worker's property, not the platform's asset — the strategic difference from Urban Company / JustDial, who take 20–30% and hold ratings hostage.
- **The worker's credibility travels with them**, readable by anyone via QR without installing anything.

## Intended users

**Implemented:** `kaarigar` (the worker — primary) and `customer` (unauthenticated; reaches the worker by QR).
**Designed but not built:** Contractor/Team Lead, Verifier, Institution/Admin, Platform Ops. The role union was deliberately narrowed to two — see §4.

## Major workflows that work today

1. **Sign in** — phone + OTP, real JWT session
2. **Voice entry** — speak a job or earning; Gemini extracts structured data
3. **Log jobs and earnings** — persisted to MongoDB, survives a device change
4. **Publish a passport** — public page at `/p/:handle` with a real scannable QR
5. **Collect a review** — worker shares a signed link; customer rates on four axes with no app or account; the review appears on the public passport
6. **Work offline** — writes queue locally with visible pending/synced/failed state and sync on reconnect

---

# 2. Original Architecture (the v1.0 design)

Summarised as the reference point for everything below. **Much of this was deliberately not built** — see §4.

## Intended stack

| Layer | Design choice |
|---|---|
| Mobile | React Native (Expo) + TypeScript, Android-first |
| On-device DB | WatermelonDB (SQLite) with causal-order sync |
| Web | Next.js (App Router), SSR for the public passport |
| Backend | **FastAPI (Python 3.11)**, modular monolith |
| Database | MongoDB 7 replica set, 2dsphere geo index |
| Cache/Queue | Redis 7 + Celery |
| Object storage | MinIO (dev) / S3 (prod) |
| ML | scikit-learn / LightGBM, ONNX |
| OCR | PaddleOCR / Tesseract + Indic models |
| Auth | Phone OTP + JWT (access/refresh), device binding |
| Observability | Prometheus + Grafana, Sentry |
| CI/CD | GitHub Actions |

## Intended six-tier layering (§5.1)

1. **Clients** — worker app, customer app, public passport, admin console, WhatsApp bot, SMS/IVR
2. **Edge** — API gateway, auth middleware, **Redis token-bucket rate limiter**
3. **Application services** — nine boundaries: `identity-svc`, `passport-svc`, `ledger-svc`, `pricing-svc`, `jobs-svc`, `reputation-svc`, `discovery-svc`, `notify-svc`, `sync-svc`
4. **Async workers** — Celery: media pipeline, OCR, score recompute, fraud scan, notifications, report generation
5. **Data** — MongoDB, Redis, object storage, analytics store, append-only audit log
6. **External** — DigiLocker, Aadhaar eKYC, e-Shram, Maps, UPI, government rate schedules

**Why a modular monolith (§5.2):** boundaries are real and enforced at the module level, but deploy as one application against one database. Drawing the boundaries now means any service can later be extracted without rewriting business logic.

## Intended eight feature modules (§4)

**A** Digital Passport · **B** Kamai ledger · **C** Mol-Bhav fair price · **D** Reputation & Discovery · **E** Job & Work Management · **F** Financial Inclusion (V1) · **G** Skilling (Later) · **H** Access Layer (cross-cutting: icon-first, multilingual, offline-first, ≤25MB APK, WhatsApp)

## Intended data model (§7)

Fifteen collections: `users`, `kaarigar_profiles`, `credentials`, `portfolio_items`, `jobs`, `quotes`, `ledger_entries`, `receivables`, `reviews`, `rate_bands`, `price_observations`, `consents`, `disputes`, `audit_log`, plus analytics rollups. Identifiers are **client-generated UUIDv7** so offline records have a stable, sortable identity from creation.

## Intended demo loop (§14.1)

Onboard + import a certificate → customer searches nearby → itemised quote against the fair-price band → job accepted, completed with before/after photos → payment logged → job-anchored review → passport and trust score update → **QR scanned on a second phone** → 6-month income statement PDF → *pull the network cable, repeat the ledger entry offline, reconnect, watch it sync.*

---

# 3. Current Architecture (what actually exists)

## Shape

A **single Express + TypeScript process** serving three things from one origin:

1. `/api/*` — the JSON API
2. `/p/:handle` and `/r/:token` — server-rendered HTML (no React, no JS)
3. Everything else — the built React SPA from `dist/`

**~11,500 lines of TypeScript** across 78 tracked source files.

## Request flow

```
Browser
  │
  ├── GET /p/:handle ──────► publicRouter (SSR)  ──► data/profiles.ts ──► MongoDB
  │                                              └──► data/reviews.ts
  │
  ├── GET/POST /r/:token ──► publicRouter (SSR)  ──► reputation.gateReviewToken()
  │                                              └──► data/reviews.ts
  │
  ├── /api/* ──────────────► registerRoutes()
  │                            ├── requireAuth (most routes)
  │                            ├── routes/*.ts  (HTTP shape + status codes)
  │                            └── data/*.ts    (validation + persistence)
  │                                              └──► MongoDB Atlas
  │
  └── everything else ─────► Vite middleware (dev) │ express.static(dist) (prod)
```

**Mount order is load-bearing.** `registerRoutes()` runs *before* the Vite middleware and the production SPA catch-all. `publicRouter` sits at the site root; mounted after either, `/p/:handle` would silently return the React shell instead of the rendered page.

## Backend

**Bootstrap:** [`server.ts`](server.ts) — Express app, port from `process.env.PORT`, binds `0.0.0.0`, connects Atlas (non-fatal), then dev/prod static handling. *Adding an endpoint should never require editing this file.*

**Routing table:** [`src/server/routes/index.ts`](src/server/routes/index.ts) — the single mounting point. All nine §5 Tier-3 boundaries are mounted from day one, including empty ones, so adding an endpoint touches exactly one file.

| Mount | Module | §5 boundary |
|---|---|---|
| `/api/health` | `routes/health.ts` | infrastructure |
| `/api/assistant` | `routes/assistant.ts` | voice/AI |
| `/api/auth` | `routes/identity.ts` | identity-svc |
| `/api/passport` | `routes/passport.ts` | passport-svc |
| `/api/jobs` | `routes/jobs.ts` | jobs-svc |
| `/api/ledger` | `routes/ledger.ts` | ledger-svc |
| `/api/sync` | `routes/sync.ts` | sync-svc |
| `/api/pricing` | `routes/pricing.ts` | pricing-svc |
| `/api/reviews` | `routes/reputation.ts` | reputation-svc |
| `/` | `routes/public.ts` | Tier-1 public surfaces |

An `/api/*` path matching no router returns an **honest JSON 404** rather than falling through to the SPA.

**Layering:** routes own HTTP shape and status codes; `src/server/data/*.ts` own validation and persistence. Both the online routes and the offline sync ingest call the same `data/` functions, so online and offline paths cannot diverge on validation rules.

## Complete endpoint inventory (23 handlers)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | — | Reports `db.connected`, `hasGeminiKey`, `publicOrigin` |
| POST | `/api/auth/otp/request` | — | Hashed code, 5-min expiry, throttled. **Delivery stubbed to server log.** `devCode` returned only when `NODE_ENV !== 'production'` |
| POST | `/api/auth/otp/verify` | — | Real JWT + rotating refresh; honours the demo OTP bypass |
| POST | `/api/auth/refresh` | — | Rotation with reuse detection; replay revokes the family |
| GET | `/api/auth/me` | ✔ | Returns `req.user` |
| GET / PATCH | `/api/passport/me` | ✔ | Owner-scoped; profile auto-creates on first read; `PATCHABLE` allowlist |
| GET | `/api/jobs` | ✔ | Owner-scoped, optional `?status=` |
| POST | `/api/jobs` | ✔ | Idempotent on client UUIDv7 |
| POST | `/api/jobs/:id/transition` | ✔ | Body `{ state }`. Enforces `JOB_TRANSITIONS` |
| GET | `/api/ledger/entries` | ✔ | `?period=` |
| POST | `/api/ledger/entries` | ✔ | Idempotent, append-only |
| GET | `/api/ledger/summary` | ✔ | Algebraic, so reversals cancel |
| POST | `/api/ledger/entries/:id/reverse` | ✔ | Original never mutated |
| POST | `/api/sync/batch` | ✔ | ≤50 items, per-item accept/reject, causal ordering |
| GET | `/api/pricing/tasks` | ✔ | Known trade/task codes |
| GET | `/api/pricing/band` | ✔ | Band + honest `sampleN` + wage floor |
| POST | `/api/assistant/process` | ✔ | Gemini extraction, rate-limited |
| POST | `/api/reviews` | — | JSON review submit; **token is the credential** |
| POST | `/api/reviews/link` | ✔ | Mint a review link; **owner-scoped** |
| GET | `/p/:handle` | — | SSR passport + inline SVG QR |
| GET | `/r/:token` | — | SSR review form, no JS |
| POST | `/r/:token` | — | Form submit (`urlencoded` parser scoped to this route only) |

## Database

**MongoDB Atlas.** Connection in [`src/server/db.ts`](src/server/db.ts); default DB name `kaarigar`.

**7 of the architecture's 15 collections are in use:**

| Collection | Indexes | Owned by |
|---|---|---|
| `users` | unique `phone` | `routes/identity.ts` |
| `otp_challenges` | TTL on `expiresAt`, `(phone, createdAt)` | `routes/identity.ts` |
| `kaarigar_profiles` | unique `userId`, unique `passportHandle` | `data/profiles.ts` |
| `jobs` | `(kaarigarId, date)`, `(kaarigarId, status)` | `data/jobs.ts` |
| `ledger_entries` | `(profileId, date)`, `(profileId, direction)` | `data/ledger.ts` |
| `rate_bands` | unique `(trade, taskCode, locality)` | `data/rateBands.ts` |
| `reviews` | **unique `jobId`**, `(subjectId, createdAt)` | `data/reviews.ts` |

Absent by decision, not omission: `credentials`, `portfolio_items`, `quotes`, `receivables`, `price_observations`, `consents`, `disputes`, `audit_log`.

Indexes are created lazily via `ensure*Indexes()` guarded by a module-level boolean — no migration step.

## Frontend

React 19 + Vite + Tailwind 4, `react-router-dom` v7.

| Path | Responsibility |
|---|---|
| `src/main.tsx` | Root: `BrowserRouter` → `AuthProvider` → `App`; primes the passport origin |
| `src/App.tsx` | **Owns all app state.** Auth gate, data loading, save handlers, routing |
| `src/auth/AuthProvider.tsx` | Session lifecycle: restore, refresh, sign out |
| `src/lib/authStore.ts` | Token pair persistence (`kaarigar_auth_v1`) |
| `src/lib/authToken.ts` | **The bearer-token seam.** Synchronous by design |
| `src/lib/api.ts` | Typed API client; the only place that knows the wire format |
| `src/lib/outbox.ts` | The offline queue (`kaarigar_outbox_v1`) |
| `src/hooks/useOutbox.ts` | React binding for the queue |
| `src/lib/featureFlags.ts` | `USE_API` per-screen switch (Track A owned) |
| `src/lib/dataSource.ts` | Maps that per-screen flag onto App's three state slices |
| `src/lib/passportLink.ts` | Builds the public passport URL from the server's origin |
| `src/components/*` | Screens: Home, Passport, Jobs, Kamai, Profile, Login, VoiceAssistant, SyncBadge, SendReviewLink |

**Client state is React `useState` in `App.tsx`.** No Redux, Zustand or Context for domain data — three slices (`profile`, `jobs`, `kamaiList`) passed down as props. The only Context is `AuthProvider`.

## Data flow: a write, end to end

```
User taps save
  └─► App.handleSaveJob()
        ├─► setJobs([newJob, ...prev])      ← instant, never blocks
        ├─► setKamaiList([newEntry, ...])
        └─► outbox.enqueue('job', newJob)   ← queued, not posted
              └─► enqueue('ledger_entry', newKamai)   (job first: causal order)

outbox.flush()  ← on mount, on 'online' event, every 30s
  └─► POST /api/sync/batch  { items: [...] }   (≤50, jobs before entries)
        └─► per-item verdict
              accepted/duplicate → remove from queue → badge shows 'synced'
              retryable          → stays queued      → badge shows 'pending'
              permanent (4xx)    → marked failed     → badge shows 'failed'
                                                       + server's own message
```

## AI / voice

**Gemini via `@google/genai`** in [`src/server/routes/assistant.ts`](src/server/routes/assistant.ts). Model string is `gemini-3.7-flash` — **Needs verification** that this is a current model id.

The response carries a `source: 'gemini' | 'fallback'` discriminator and, on fallback, a typed `fallbackReason` (`no_api_key` | `empty_response` | `invalid_json` | `api_error`). This exists because both paths previously returned a well-formed 200 and nobody could tell which had run — the keyword fallback was silently carrying the whole demo.

`AssistantProcessResponse` in `types.ts` is a **discriminated union** that will not accept `fallbackReason: null` on the gemini path.

Not implemented from §10: LightGBM pricing model, fake-review detection, perceptual hashing, bill OCR, trust score, demand forecasting.

## Authentication

Phone OTP → JWT. `requireAuth` ([`src/server/middleware/auth.ts`](src/server/middleware/auth.ts)) verifies a bearer access token and populates `req.user`.

- Access token 15 min; refresh token rotates on every use
- **Refresh reuse detection**: presenting an already-rotated token revokes the whole family
- OTP codes are **hashed** at rest; single-use; attempt-capped; per-number throttled
- Same response whether or not a number is known — no enumeration oracle
- **Object-level authorisation**: ownership is part of every query filter, so cross-user access returns **404, not 403** — a probe cannot learn which ids exist

**A demo OTP bypass exists** ([`src/server/auth/demoOtp.ts`](src/server/auth/demoOtp.ts)): a fixed code for one env-configured phone number, off unless three variables are all set and well-formed. Server-side only — no `VITE_` prefix, so it cannot reach the browser bundle.

## External services

| Service | State |
|---|---|
| MongoDB Atlas | **Live** |
| Google Gemini | **Live** |
| Render | **Live** — the deploy target |
| Firebase phone auth | **Abandoned.** Dependency present, imported only by `otp-test.ts` |
| DigiLocker, e-Shram, UPI, Maps, WhatsApp | **Not integrated.** Cut from scope |

---

# 4. Original Architecture vs. Current Implementation

Every difference below is **intentional and ratified** in `MIGRATION_PLAN.md` unless marked otherwise.

## Ratified amendments

| Architecture says | Built | Why | Status |
|---|---|---|---|
| **FastAPI (Python 3.11)** | **Express / TypeScript** | A rewrite buys zero capability and costs ~2 of 10 days. The nine §5 boundaries are honoured exactly as router + data-access modules. | **Permanent** |
| Voice is "Later, accessibility only" (§4H) | Voice is a **first-class MVP input** | 908 working lines already existed; cutting it would remove function and cost days. | **Permanent** |
| **WatermelonDB + causal-order sync** (§9) | **localStorage outbox** | 1–2 days instead of ~5, indistinguishable on stage. The append-only ledger is retained in full, so a V1 swap is a storage adapter, not a redesign. | **Intentional; revisit at V1** |
| **Six roles** (§3) | **Two**: `kaarigar`, `customer` | Only two actors are ever authenticated in the locked scope. Naming four roles we neither build nor test puts aspirational values in a frozen contract. | **Permanent for now** |
| **Redis token bucket** (§5 Tier 2) | **In-process rate limiter** | Correct for the single container we ship. | **Technical debt** — must be replaced before horizontal scaling |
| React Native (Expo) | **React 19 web SPA** | The prototype was already a web app. | **Permanent** |
| Next.js SSR for the public passport | **Express-rendered HTML**, styles inlined | One deployable, one origin. Also one HTTP request — no stylesheet round trip on 2G. | **Permanent** |
| Public passport at `kaarigar.in/k/{handle}` | **`/p/:handle`** on the deploy origin | §8 already used `/p/{handle}`; the §4A path was inconsistent with it. | **Permanent** |

## Cut entirely (roadmap slide only)

Media/photo upload and portfolio capture · DigiLocker · e-Shram · UPI · W3C Verifiable Credentials · consent artifacts · audit log · admin console · Celery async workers · OCR · **geo discovery** (`discovery-svc`) · skilling module · crew mode · `notify-svc` / WhatsApp / SMS-IVR.

## Demo-loop substitutions (state these openly if asked)

1. **Geo discovery → QR.** The customer reaches the worker by opening the QR passport, not by searching nearby.
2. **Before/after photos → cut.** No file input anywhere.
3. **"Imports one certificate" → no substitution recorded.** DigiLocker is cut and §14.1's first beat has no documented replacement. **This is a gap in the plan, not in the code.**

## Unaccounted for — in the architecture, in neither the scope nor the cut list

- **`POST /ledger/export/income-statement`** (§8) — `MIGRATION_PLAN.md` Part 3 lists "income statement PDF" under **"Building properly (non-negotiable)"**, and §14.1's loop *ends* on it. No route exists. The frontend button is an `alert()`.
- **`POST /quotes`** and the `quotes` collection (§7, §8) — §14.1's third beat is *"worker builds an itemised quote against the fair-price band."* Not in the locked scope, not in the cut list. **Fell out by omission rather than decision.**

## Decisions that must not be accidentally reverted

> These are the ones an AI or a new developer could plausibly "clean up" and break something important.

1. **Route mount order** — `registerRoutes()` must run before Vite middleware and before the SPA catch-all. Reordering makes `/p/:handle` silently serve the React shell.
2. **`getAuthToken()` is synchronous.** Making it async would force an edit at every fetch call site — the opposite of what the seam is for. Freshness is `AuthProvider`'s job.
3. **One shared refresh timer.** Two concurrent refreshes present the same token; the second reads as a replay and identity-svc revokes the family — signing a user out for rendering two screens.
4. **404, not 403,** for another user's object. Consistent everywhere; changing it creates an existence oracle.
5. **`data/*.ts` is the only path to a collection.** Both online routes and sync ingest go through it. A raw query in a route re-creates the online/offline divergence this prevents.
6. **`types.ts` is frozen.** Changes require agreement across all three tracks.
7. **`localStorage` is not written for an API-backed domain.** A stale shadow copy silently becoming the source of truth again is the failure mode.
8. **The outbox does not roll back.** A failed write is queued and surfaced, never deleted. Rolling back deletes a payment the worker just recorded.
9. **Permanently-failed items are never retried.** `lib/retry.ts` derives retryability from HTTP status; deciding it per-error-site re-creates the retry-forever bug.
10. **`seededFrom` is a citation field.** Never write a source a row does not actually carry.

---

# 5. Implementation Progress

## Feature modules (§4)

### Module A — Digital Passport · **Partially implemented**

**Works:** `GET`/`PATCH /api/passport/me`, owner-scoped, profile auto-creates on first read, handle allocated with collision suffix. Public SSR page at `/p/:handle` with a real inline-SVG QR encoding the absolute deployed URL (error correction level Q, for projector/phone-screen scanning). Unknown handle → 404, malformed → 404, DB down → 503. Review aggregate renders on the page. Privacy is an allowlist applied as a **MongoDB projection**, so `phone`, `totalEarnings`, `dailyRate`, `bloodGroup`, `userId` never enter the process.

**Not built:** credentials/DigiLocker, portfolio media, W3C verifiable credentials, endorsements, per-field visibility control (§8's *"only fields the worker marked public"* — needs a flag `types.ts` can't carry while frozen).

**Stub:** "Download ID" is still `alert()` at [`DigitalPassport.tsx:272`](src/components/DigitalPassport.tsx:272).

### Module B — Kamai Ledger · **Partially implemented**

**Works:** genuinely append-only — idempotent writes, reversing entries, **no update or delete route exists**. Day/week/month summaries are algebraic so reversals cancel correctly. `KamaiView` reads from MongoDB when `USE_API` is on.

**Not built:** udhaar/receivables tracker, material expense capture + OCR, **income statement PDF export** (see §4).

### Module C — Mol-Bhav Fair Price · **Partially implemented**

**Works:** band lookup, honest `sampleN`, suppression below a minimum observation threshold, wage floor enforced server-side. Rates now live in `data/rate-bands.csv` with a mandatory per-row citation; `npm run seed:rates` **refuses** unsourced rows unless `--allow-unsourced`; `npm run check:rates` exits non-zero while anything is unsourced.

**Critically:** **all 33 bands in the database are placeholders.** They self-declare — the API returns `seededFrom: "PLACEHOLDER - not sourced, replace before demo"`.

**Not built:** quote builder, negotiation view, price observations, live band re-fitting, any ML.

### Module D — Reputation · **Mostly complete** (discovery **cut**)

**Works:** `POST /api/reviews/link` (owner-scoped mint), `GET`/`POST /r/:token` (SSR form, no JavaScript), `POST /api/reviews` (JSON equivalent). Four rating axes, all required. Single-use enforced by a **unique index on `jobId`**, not a check — two concurrent submissions would both pass a check. HMAC signature compared with `timingSafeEqual`. Reviews render on the public passport with a per-axis breakdown. `SendReviewLink` button appears on `COMPLETED`/`SETTLED` jobs and shares via `navigator.share` with clipboard fallback.

**Not built:** trust score (§11) — the rubric is typed in `types.ts` but nothing computes it. Worker response to a review, dispute queue, fake-review detection.

**Cut:** geo discovery (`discovery-svc` is an unmounted concept; there is no such router).

### Module E — Job & Work Management · **Partially implemented**

**Works:** full 10-state machine enforced server-side; illegal transitions rejected 409 with `from`/`attempted`/`allowed`; history appended; `DISPUTED` representable but **unreachable by design** (no inbound edge in `JOB_TRANSITIONS`).

**Not built:** availability toggle, job card with photos, crew mode.

**Confirmed bug:** `JobsView` does not display job status at all. `job.status` is referenced **nowhere** in the file, and [`JobsView.tsx:190`](src/components/JobsView.tsx:190) renders a hardcoded `Completed` chip on every card. A `REQUESTED` job displays as Completed. The 10-state machine is the module's main technical claim and the UI contradicts it. See §7.

### Module F — Financial Inclusion · **Not started** (V1 in the architecture, cut from scope)
### Module G — Skilling · **Not started** (Later in the architecture, cut)

### Module H — Access Layer · **Partially implemented**

**Works:** icon-first UI, five languages (hi/pa/kn/mr/en), 48dp+ targets on new components, voice input, **offline outbox with visible sync state**.

**Not built:** WhatsApp channel, SMS/IVR, TTS readout. APK size / Android-8 targets are **not applicable** — this is a web app.

## Cross-cutting

| Concern | Status | Detail |
|---|---|---|
| Authentication | **Complete** for the locked scope | JWT spine + login UI + session lifecycle. **SMS delivery stubbed.** |
| Authorisation | **Complete** | Object-level, verified with two users |
| Persistence | **Complete** for 7 collections | |
| Offline & sync | **Complete** | Both halves; verified in production |
| Validation | **Complete** | Every write endpoint names the offending field |
| Error handling | **Complete** | `source` discriminator, per-item sync reasons, server messages surfaced to users |
| Rate limiting | **Partial** | In-process; per-instance. Must become shared before scaling |
| Testing | **Partial** | 25 regression tests + tree-completeness pre-commit hook. **No unit tests, no CI** |
| Deployment | **Complete** | Render Blueprint from `main` |
| Observability | **Not started** | Structured logging only |
| Media / photos | **Cut** | No file input anywhere |

---

# 6. Important Technical Decisions

## Technology

- **Express/TypeScript over FastAPI** — see §4. The §5 service boundaries are preserved as router + data modules, which is what makes Amendment 1 honest rather than a shortcut.
- **One deployable, one origin.** The SPA, the API and the SSR pages all come from one Express process. Splitting the frontend to Vercel would put `/p/:handle` on an origin with no handler — re-creating the misleading-200 bug architecturally.
- **Self-contained SSR pages.** `/p/:handle` inlines its CSS and its QR (as SVG) rather than referencing Vite's content-hashed stylesheet. One request, no round trip, no coupling to a filename that changes every build.

## APIs

- **Envelopes.** Every route wraps its payload in a named key (`{ profile }`, `{ jobs }`, `{ entry }`). `src/lib/api.ts` unwraps in one place so no screen writes `body.profile`.
- **Idempotency on client-generated UUIDv7.** The idempotency lookup is *unscoped* and ownership picks the branch: absent → insert, present + caller owns → idempotent success, present + someone else → conflict. Scoping the read instead made another user's id look absent, the insert fell through, and Mongo rejected on the unique `_id` — surfacing as a 500 the outbox would retry forever.
- **Retryability is derived, not hand-written.** `src/server/lib/retry.ts` maps status → disposition: 4xx (except 408/429) permanent, everything else retryable.

## Database

- **Client-generated UUIDv7 `_id`.** Offline records have a stable, sortable identity from creation. Challenge ids stay v4 — ephemeral, never sorted; mixing v4 and v7 in one sorted collection breaks the sort silently.
- **Append-only ledger.** No update or delete route exists. Corrections are reversing entries. This preserves audit trail, makes exports credible to a lender, and **eliminates most offline-sync conflicts by construction**.
- **Unique index on `reviews.jobId`** is the single-use mechanism.

## State management

- **`useState` in `App.tsx`, props down.** No state library. Three slices only.
- **The outbox is a plain module, not React state** — it must survive unmounts, keep flushing when nothing is watching, and be writable from a handler with no hook context.
- **`USE_API` is per-screen but maps onto three shared slices.** A domain is API-backed if *any* screen reading it is. The reverse would let one screen write the database while another wrote the same slice to localStorage, diverging silently while both looked correct. **Consequence: `USE_API="home"` pulls all three domains** — the dashboard reads all three.

## Auth / security

- Passwords are never used — a barrier for this user group; OTP is the norm they understand.
- **Every interpolated value in SSR output is HTML-escaped.** `name`, `bio`, `skills`, `trade`, `location`, `certifications` are all worker-patchable, making this a stored-XSS path to a page served to strangers.
- **The review token is the credential.** §8 wants "the author is its customer", but there are no customer accounts. Possession of a signed, job-bound token stands in. It still guarantees what §4D needs: bound to one existing job, cannot be repointed, cannot be minted without the server key, cannot be used twice.
- **Origin resolution reads `x-forwarded-proto`**, not `req.protocol` — behind Render's proxy the latter says `http` and would bake a mixed-content warning into every printed QR.

## Error handling

Server messages are written to be shown to a person and are surfaced verbatim. `ApiError` carries `field` because every write endpoint names the offending field.

## Testing

`scripts/test-regressions.ts` — **25 HTTP + in-process tests** against a running dev server. Deliberately not a general suite: these are specifically the bugs where a plausible refactor reintroduces them with no type error and no obvious symptom. `scripts/check-tree.ts` runs pre-commit and asserts every relative import resolves.

## Deployment

Render Blueprint from `render.yaml`, tracking `main`, free plan, Singapore (closest free region to the Mumbai Atlas cluster). `buildCommand` **must** keep `--include=dev`: Render sets `NODE_ENV=production`, under which npm omits devDependencies — and `esbuild`, `tailwindcss` and `typescript` are all needed at build time.

## Naming and structure

`routes/` = HTTP shape · `data/` = validation + persistence · `lib/` = pure helpers · `middleware/` = cross-cutting. Client mirrors this: `lib/` for logic, `components/` for screens, `hooks/` for React bindings.

---

# 7. Known Issues and Technical Debt

## Likely bugs

| # | Issue | Evidence |
|---|---|---|
| 1 | **`JobsView` renders a hardcoded "Completed" chip on every job.** A `REQUESTED` job displays as Completed. **Confirmed:** `job.status` appears nowhere in the file. | [`JobsView.tsx:190`](src/components/JobsView.tsx:190) — literal `Completed`; `grep 'job.status' src/components/JobsView.tsx` returns nothing. |
| 2 | **`electrician/unsupported_task`** sits in `rate_bands` with an **empty** `seededFrom` and appears in no CSV and no source file. | Flagged by `npm run check:rates` as `NO CITATION AT ALL`. Left deliberately — not safe to assume nothing depends on it. |

## Temporary implementations

- **OTP delivery is stubbed to the server log.** Everything else about the OTP system is real.
- **Demo OTP bypass** — intended for the stage demo; delete the env vars afterwards.
- **`otp-test.html` is in the production build** — a public, unauthenticated page that can spend Firebase SMS quota. Tracked in [issue #12](https://github.com/deepindersinghbti/Kaarigar/issues/12); **must be removed before the final demo build.**
- **All 33 rate bands are placeholders.**

## Missing validation / gaps

- **No per-field passport visibility.** §8's "only fields the worker marked public" is approximated by a fixed allowlist.
- **`RateBand` has no `unit` field** (§6.2). `wageFloor` is a *daily* wage but tasks like `wall_paint_sqft` are priced per square foot — the floor was raising ₹8/sqft to ₹350/sqft, ~25× market. A suffix-inference guard (`_sqft|_metre|_point|…`) returns those unfloored with `floorApplicable: false`. **The correct fix is a `unit` field, which requires unfreezing `types.ts` with all three tracks.**

## Security

- **In-process rate limiter** — per-instance. Must become shared before horizontal scaling.
- **Tokens in `localStorage`** — script on this origin can read them. The stronger option (refresh token in an httpOnly `SameSite` cookie) needs a cookie-issuing path, CSRF handling on every mutation, and breaks the synchronous `getAuthToken()` seam. Mitigations: no third-party scripts, all SSR output escaped, 15-minute access tokens, refresh rotation with family revocation.
- **The demo OTP code is a shared secret in an env var.** Rotate after any event where it was used or shared.

## Performance

- **Render free tier spins down after ~15 min idle; ~50s cold start.** A judge scanning the QR would stare at a blank screen. The GitHub Actions workflow is `workflow_dispatch`-only (manual pre-demo warmer); **the standing UptimeRobot monitor described in the README has not been confirmed created — Needs verification.**
- **No pagination anywhere.** `GET /api/jobs` and `/api/ledger/entries` return everything.

## Incomplete refactors / dead code

- **`firebase` dependency is imported only by `otp-test.ts`** — dead weight in `package.json` once the harness is removed.
- **`autoprefixer`** appears in devDependencies with no source reference — **Needs verification** whether Tailwind 4 requires it.
- **`otp-test.html` / `otp-test.ts`** — throwaway harness, its own header says to delete it.
- **`AUDIT_REPORT.md`, `GAP_MATRIX.md`, `claude-code-prompt-phase6-10day-plan.md`** describe a much earlier state and are **historical, not current.**

## No TODO/FIXME markers

`git grep TODO|FIXME|HACK|XXX` over `src/`, `scripts/` and `server.ts` returns **nothing**. Intent is carried in prose comments instead — which are dense and worth reading before changing a file.

---

# 8. Remaining Work (prioritised)

## Critical — blocks a credible demo

| # | Task | Depends on | Notes |
|---|---|---|---|
| C1 | **Replace the 33 placeholder rate bands** | Someone with the CPWD DSR PDF or a state PWD schedule | Mechanism is built. Fill `data/rate-bands.csv`, run `npm run seed:rates && npm run check:rates`. §14.1: claiming a source you don't have is the fastest way to lose a panel. |
| C2 | **Remove `otp-test.html` from the build** | — | [Issue #12](https://github.com/deepindersinghbti/Kaarigar/issues/12). Public page that spends SMS quota. |
| C3 | **Create the UptimeRobot monitor** | — | Config table in README. Nothing currently prevents a cold start mid-demo. |
| C4 | **Fix the JobsView status chip** | — | **Confirmed:** every job displays "Completed" regardless of state. `job.status` is unused in the file. Visible on stage. |

## High priority

| # | Task | Depends on |
|---|---|---|
| H1 | **Income statement PDF** (`POST /ledger/export/income-statement` + wire the `alert()`) | `GET /api/ledger/summary` (exists). Listed **non-negotiable** in the locked scope and closes the §14.1 loop. |
| H2 | **Decide `RateBand.unit`** | All three tracks agreeing to unfreeze `types.ts`. Blocks a correct wage floor for per-unit tasks. |
| H3 | **Trust score (§11)** | Reviews (done) supply `customerRatings`. Rubric is typed; nothing computes it. |
| H4 | **Rotate `DEMO_OTP_CODE`** | — |

## Medium

| # | Task |
|---|---|
| M1 | Decide `POST /quotes` explicitly — build it or cut it in writing |
| M2 | Pagination on `/api/jobs` and `/api/ledger/entries` |
| M3 | CI (lint + regressions on PR) — GitHub Actions minutes are constrained on a private repo; see README |
| M4 | Unit tests for `data/*.ts` validation |
| M5 | Record a substitution for §14.1's "imports one certificate" beat |
| M6 | Delete the `firebase` dependency once the harness is gone |

## Nice to have

Receivables/udhaar tracker · availability toggle · worker response to a review · observability (Sentry) · shared rate limiter (Redis) · WhatsApp channel · per-field passport visibility.

---

# 9. Development Setup

## Required software

- **Node.js 22** (pinned in `render.yaml`; developed on 24, both work)
- **npm** (lockfile is v3)
- **git**
- A **MongoDB Atlas** cluster (free M0 is fine)
- A **Google Gemini API key** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

## Install

```bash
npm install
```

## Environment

Copy `.env.example` to `.env` and fill it in. `.env*` is gitignored except the example. **`.env.example` is the canonical documentation — every key is explained there, and the standing rule is that a new key is added to it in the same commit that introduces it.**

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Server-side only. Without it every assistant call silently falls back to the keyword matcher. |
| `MONGODB_URI` | Atlas connection string. **A connection *timeout* means your IP is missing from the Atlas Network Access allowlist** — not a wrong URI. |
| `JWT_SECRET` | Signs access + refresh tokens. Min 32 chars. **Must be byte-identical across local and deployed**, or tokens fail verification and it looks like a bug in `requireAuth`. |
| `PUBLIC_ORIGIN` | Optional. Absolute origin the QR and review links encode. Unset → reconstructed per request. **Set it before generating any QR that will be printed.** |
| `REVIEW_LINK_SECRET` | Optional. Signs review-link HMACs. Unset → a key is *derived* from `JWT_SECRET` under a fixed label, so a leaked link reveals nothing about the token key. |
| `DEMO_OTP_ENABLED` / `DEMO_OTP_PHONE` / `DEMO_OTP_CODE` | Optional. Fixed OTP for one number. All three required and well-formed or the bypass is off. **Server-side only — no `VITE_` prefix.** |
| `VITE_USE_API` | Build-time. `""` \| screen list \| `"all"`. **Inlined by Vite — changing it needs a rebuild, not a restart.** |
| `VITE_FIREBASE_*` (×4) | Read only by `otp-test.html`. Leave blank unless testing Firebase. |
| `MONGODB_DB_NAME`, `PORT`, `NODE_ENV`, `DISABLE_HMR` | Optional overrides. |

> **Never commit real values.** Secrets are distributed out-of-band; see `MIGRATION_PLAN.md` P3.

## Database setup

```bash
npm run seed
```

```bash
npm run seed:rates -- --allow-unsourced
```

The `--allow-unsourced` flag is required while `data/rate-bands.csv` still carries placeholder citations. Drop it once real data is in.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server on :3000 (Express + Vite middleware) |
| `npm run build` | `vite build` + bundle `server.ts` → `dist/server.cjs` |
| `npm start` | Run the production bundle |
| `npm run lint` | `tsc --noEmit` — **full `strict`; must stay at 0 errors** |
| `npm run test:regressions` | 25 tests. **Requires a running dev server** (`NODE_ENV` must *not* be production, or `devCode` is suppressed and the suite can't authenticate) |
| `npm run check:rates` | Reports unsourced bands; non-zero exit while any remain |
| `npm run check:tree` | Import-resolution check (also runs pre-commit) |
| `npm run seed`, `npm run seed:rates` | Seed data |

## Deployment

Render **Blueprint** (New → Blueprint), reads `render.yaml`, tracks `main`. Push to `main` → auto-deploy.

- Secrets marked `sync: false` are entered in the Render dashboard. **No quotes** — dotenv strips them locally, Render does not.
- `VITE_*` changes need a **redeploy**, not a restart.
- Verify a deploy by comparing the bundle hash: `curl -s <origin>/ | grep -o 'main-[A-Za-z0-9_-]*\.js'` against a local build.
- Free tier: 512 MB, spins down after ~15 min, ~50s cold start, no SSH.

---

# 10. Repository Navigation Guide

```
server.ts                      Bootstrap ONLY. Adding a route should never touch this.
render.yaml                    Deploy config + the Day-9 USE_API decision, recorded
data/rate-bands.csv            Fair-price data. One row = one band + a MANDATORY citation

src/types.ts                   ★ THE FROZEN CONTRACT. Read first. Changes need all 3 tracks.

src/server/
  db.ts                        Atlas connection, error categorisation
  routes/index.ts              ★ The single mounting table. Mount ORDER is load-bearing.
  routes/*.ts                  HTTP shape + status codes, one per §5 boundary
  data/*.ts                    ★ Validation + persistence. The ONLY path to a collection.
  middleware/auth.ts           requireAuth → req.user
  middleware/rateLimit.ts      In-process limiter (Redis replacement pending)
  lib/retry.ts                 ★ Status → retryable. Never decide this at a rejection site.
  lib/reviewToken.ts           HMAC review links, timingSafeEqual
  lib/origin.ts                Shared origin resolution (QR + review links must agree)
  auth/tokens.ts               JWT sign/verify
  auth/demoOtp.ts              Env-scoped demo bypass. Server-side only.

src/
  App.tsx                      ★ Owns ALL app state. Auth gate, loading, save handlers.
  main.tsx                     Root wiring
  auth/AuthProvider.tsx        ★ Session lifecycle. One refresh timer — do not duplicate.
  lib/api.ts                   Typed client; the only place that knows the wire format
  lib/outbox.ts                ★ The offline queue. Does not roll back.
  lib/authToken.ts             ★ The bearer-token seam. Deliberately synchronous.
  lib/dataSource.ts            USE_API screen → data-domain mapping
  hooks/useOutbox.ts           React binding for the queue
  components/                  Screens + SyncBadge + SendReviewLink

scripts/
  seed.ts                      Demo worker + sample data
  seedRateBands.ts             CSV → rate_bands; REFUSES unsourced rows by default
  check-rates.ts               Demo-readiness gate for pricing
  test-regressions.ts          25 tests
  check-tree.ts                Import resolution (pre-commit)

otp-test.html / otp-test.ts    ⚠ TEMPORARY Firebase harness. Remove before the demo (#12).

Kaarigar_Architecture_v1.pdf   The original design. Reference, not current state.
KAARIGAR_STATUS_REPORT.pdf     Status as of 657049e — SUPERSEDED by this document.
MIGRATION_PLAN.md              ★ Ratified amendments + team split. Still authoritative.
AUDIT_REPORT.md, GAP_MATRIX.md Historical. Describe a much earlier state.
README.md                      ★ Setup, keep-warm, demo OTP, Firebase post-mortem, rate sourcing
```

---

# 11. Constraints and Invariants

> **Read this section before letting an AI touch the codebase.** Every item is something a plausible-looking change would break.

## Structural

1. **`registerRoutes()` before Vite/SPA.** Otherwise `/p/:handle` returns the React shell — a 200 that looks alive and serves nothing.
2. **`server.ts` is bootstrap only.** If a task seems to need an edit there, the boundary is probably wrong.
3. **`data/*.ts` is the only path to a collection.** No raw queries in routes. Online and offline must share validation.
4. **`types.ts` is frozen.** Do not add a field to it to make something compile.

## Correctness

5. **The ledger is append-only.** Never add an update or delete route. Corrections are reversing entries.
6. **`DISPUTED` has no inbound edge** in `JOB_TRANSITIONS`. Representable so data can be honest; not reachable because the dispute flow is cut. Adding an edge is a scope change.
7. **All ids are client-generated UUIDv7** except OTP challenges (v4, ephemeral, never sorted).
8. **Idempotency lookups are unscoped; ownership picks the branch.** Scoping the read produces a 500 the outbox retries forever.
9. **Retryability comes from `lib/retry.ts`.** Never hand-write `retryable` at a rejection site.
10. **The outbox never rolls back.** Queue and surface; do not delete a record because a write failed.
11. **Permanently-failed items are never re-sent.**

## Security

12. **404, not 403,** for another user's object.
13. **Escape every interpolated value in SSR output.** Worker-patchable fields reach strangers.
14. **`seededFrom` is a citation.** Never write a source a row does not carry. Never invent a government citation.
15. **Nothing server-secret gets a `VITE_` prefix.** That prefix is why a live credential once shipped in the browser bundle.
16. **Review-link signatures compare with `timingSafeEqual`.**
17. **One message for every review-token failure** — distinguishing them creates an existence oracle.

## Client

18. **`getAuthToken()` stays synchronous.**
19. **One refresh timer, in `AuthProvider`.** Concurrent refreshes trigger reuse detection and revoke the family.
20. **Do not write `localStorage` for an API-backed domain.**
21. **Do not render screens over unloaded data.** An empty ledger and an unloaded ledger are pixel-identical and mean opposite things.
22. **The auth gate sits after every hook in `App.tsx`.** Moving it earlier breaks the rules of hooks when `status` flips.

## Operational

23. **`VITE_*` is inlined at build time.** Changing it needs a redeploy. Verify via bundle hash.
24. **`--include=dev` must stay in `render.yaml`'s buildCommand.**
25. **Clean up test data by exact `_id`.** A field-filter cleanup in this project once deleted 18 rows it did not create.

---

# 12. Recommended Next Development Session

## Start with C4 — verify and fix the JobsView status chip

**Why first:** cheapest item with the highest stage visibility, and it is **confirmed**, not suspected — `job.status` appears nowhere in `JobsView.tsx`, and line 190 renders a literal `Completed` on every card. Every job on the Jobs screen therefore displays "Completed" regardless of its real state, directly contradicting the 10-state machine that is the module's main technical claim.

**Files:** [`src/components/JobsView.tsx`](src/components/JobsView.tsx) (the status span in the job card), `src/types.ts` (`JOB_BADGE` already maps every `JobState` to a display bucket and is **total by construction** — use it rather than writing a new mapping).

**Outcome:** the chip reflects `job.status` via `JOB_BADGE`, with colours per bucket.

**Dependencies:** none.

**Pitfalls:** `JOB_BADGE` is exhaustive over `JobState` deliberately — adding a state breaks the build, which is the point. Do not replace it with a `switch` with a `default`. Also `JobsView` now takes `workerName` and `syncStateOf` props; do not drop them while editing.

**Verify:** create a job via the API, drive it through `QUOTED → ACCEPTED → SCHEDULED → IN_PROGRESS → COMPLETED` with `POST /api/jobs/:id/transition` (body `{ state }`), and confirm the chip changes at each step. Then `npm run lint` (0 errors) and `npm run test:regressions` (25 passing).

## Then H1 — the income statement PDF

The only remaining item explicitly marked **non-negotiable** in the locked scope, and the closing beat of §14.1's demo loop. `GET /api/ledger/summary` already returns everything needed. Add `POST /api/ledger/export/income-statement` in `routes/ledger.ts`, and replace the `alert()` in the Kamai screen. Choose a PDF approach that does not bloat the client bundle — server-side generation fits the existing SSR pattern.

**Cleanup tasks (C2, C3, H4) are dashboard/config work**, not code, and can happen in parallel.

---

# Context for the Next AI Assistant

> Paste this section into a new conversation to continue work.

## What this is

**Kaarigar** — a portable professional identity, earnings and fair-pricing platform for India's skilled trade workers (electricians, plumbers, carpenters, masons, painters). Built for Smart India Hackathon 2026. The central object is the **Digital Kaarigar Passport**: a worker-owned, QR-verifiable record of skill and work history. Every other module exists to add provable claims to it. Zero commission from workers; reputation is theirs, not the platform's.

## Current architecture

A **single Express + TypeScript process** (`server.ts`) serving three things from one origin:
1. `/api/*` — JSON API
2. `/p/:handle`, `/r/:token` — server-rendered HTML, no JavaScript
3. Everything else — the React 19 SPA from `dist/`

**Mount order is load-bearing:** `registerRoutes()` runs before the Vite middleware and the SPA catch-all. Reversing it makes `/p/:handle` silently serve the React shell.

Layering: `routes/*.ts` = HTTP shape and status codes; `src/server/data/*.ts` = validation and persistence and **the only path to a collection**. Both the online routes and the offline sync ingest call the same `data/` functions, so they cannot diverge.

## Tech stack

React 19 · Vite 6 · Tailwind 4 · react-router-dom 7 · Express 4 · TypeScript 5.8 (**full `strict`, 0 errors**) · MongoDB Atlas · Google Gemini (`@google/genai`) · jsonwebtoken · qrcode · deployed on Render from `main`.

**Not used despite appearing in the architecture:** FastAPI, Redis, Celery, WatermelonDB, Next.js, React Native, S3/MinIO, LightGBM, PaddleOCR.

## Already implemented

- **Auth** — phone OTP → JWT (15-min access + rotating refresh with reuse detection), login screen in 5 languages, session restore, 401-driven sign-out. **SMS delivery is stubbed to the server log**; everything else is real.
- **Passport** — `GET`/`PATCH /api/passport/me` + public SSR page at `/p/:handle` with a real inline-SVG QR. Unknown handle → 404.
- **Jobs** — full 10-state machine, illegal transitions rejected 409.
- **Ledger** — append-only, idempotent, reversing entries, algebraic summaries.
- **Reviews** — HMAC-signed single-use links, SSR form needing no JS, four rating axes, renders on the passport. `SendReviewLink` button in the app.
- **Offline outbox** — writes queue locally, flush on reconnect/interval, per-record pending/synced/failed badges, permanent failures never retried.
- **Pricing** — band lookup with honest sample size and a server-side wage floor. **All 33 bands are placeholders that self-declare.**
- **Voice** — Gemini extraction with a `source: 'gemini' | 'fallback'` discriminator.
- **Deployed and verified in production.**

## Architectural decisions you must not revert

1. `registerRoutes()` before Vite/SPA
2. `getAuthToken()` is **synchronous** — async would force an edit at every call site
3. **One** refresh timer in `AuthProvider` — concurrent refreshes trigger reuse detection and revoke the session family
4. **404, not 403**, for another user's object
5. `data/*.ts` is the only path to a collection
6. `src/types.ts` is **frozen** — do not add fields to make something compile
7. The ledger is append-only; no update/delete route
8. The outbox **never rolls back**; permanently-failed items are **never re-sent**
9. `localStorage` is not written for an API-backed domain
10. Nothing server-secret gets a `VITE_` prefix
11. `seededFrom` is a citation — never write a source a row does not carry

## Known problems

- **All 33 rate bands are unsourced placeholders.** `npm run check:rates` fails until fixed.
- **`JobsView` renders a hardcoded "Completed" chip on every job** — `job.status` appears nowhere in the file (`JobsView.tsx:190`). Confirmed.
- `electrician/unsupported_task` sits in `rate_bands` with an **empty** citation, referenced nowhere.
- `otp-test.html` is in the production build — public, can spend Firebase SMS quota. Must be removed.
- In-process rate limiter (per-instance), tokens in `localStorage`, no pagination, no CI, no observability.
- **Firebase phone OTP is abandoned** — a fresh project failed identically with `INVALID_APP_CREDENTIAL`. Full elimination table is in the README. Do not re-derive it.

## What remains

**Critical:** real rate-band data · remove `otp-test.html` · UptimeRobot monitor · fix the JobsView status chip.
**High:** income statement PDF (`POST /ledger/export/income-statement` — non-negotiable scope, closes the demo loop) · decide `RateBand.unit` (frozen-contract change) · trust score.
**Medium:** decide `POST /quotes` explicitly · pagination · CI · unit tests.

## Immediate next task

**Fix the job status chip in `src/components/JobsView.tsx`** (`job.status` is currently unused; line 190 hardcodes `Completed`). Use `JOB_BADGE` from `src/types.ts` (total over `JobState` by construction — don't replace it with a `switch` + `default`). Verify by driving a job through every transition via `POST /api/jobs/:id/transition` with body `{ state }` and watching the chip change. Then `npm run lint` (0 errors) and `npm run test:regressions` (25 passing, needs a running dev server with `NODE_ENV` unset).

## Inspect before modifying anything

1. **`src/types.ts`** — the frozen contract. Everything is typed against it.
2. **`src/server/routes/index.ts`** — the mounting table and the comment explaining mount order.
3. **`README.md`** — setup, the demo OTP bypass, the Firebase post-mortem, rate-band sourcing rules.
4. **`MIGRATION_PLAN.md`** — the ratified amendments (Express over FastAPI, localStorage over WatermelonDB, two roles not six) and the track ownership split.
5. **The file you are about to change.** There are **no TODO/FIXME markers anywhere** in this codebase — intent is carried in dense prose comments that explain *why*, including which bugs a given line prevents. Read them before assuming something is redundant.

## Working conventions

- `npm run lint` must stay at **0 errors** under full `strict`.
- `npm run test:regressions` must stay at **25 passing**; it needs a running dev server and `NODE_ENV` unset.
- **Clean up any test data from Atlas by exact `_id`** — never by field filter. A field-filter cleanup here once deleted 18 rows it did not create.
- Branch off `main`; **do not stack PRs.** A stacked PR in this repo once merged into its base branch instead of `main`, and the change silently never reached production.
