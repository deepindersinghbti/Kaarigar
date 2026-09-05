# Kaarigar - Comprehensive Project Handoff

**Prepared:** 4 September 2026

**Reference design:** `Kaarigar_Architecture_v1.pdf`, version 1.0, 27 August 2026

**Code baseline inspected:** `6243ab0fabc1e58902590559cebffce9e7da8d7c`

**Active development branch:** `codex/sih-mvp`

**Live deployment:** <https://kaarigar.onrender.com>

> This document describes the implementation by reading the current code. The PDF is the intended architecture, not proof that a feature exists. Where the documents and code disagree, the code is the implementation source of truth. Unknown external state is labelled **Needs verification**.

## Handoff state at the time this document was written

- `codex/sih-mvp` and `upstream/main` pointed to the same commit (`6243ab0`, divergence `0 0`).
- The working tree contained the uncommitted Run 9 cleanup: 3,534 verified deletions under accidental `tmp/`, `output/`, Python cache, and unrelated PDF-generation paths, plus a narrow `.gitignore` update.
- This handoff update is also intentionally uncommitted. The project owner has a standing rule: **never commit without explicit permission**.
- Run 9 validation passed: `npm run lint`, `npm run build`, `npm run check:tree`, and `git diff --check`.
- The production build completed with one warning: the main JavaScript chunk is about 552.7 kB after minification.
- On 4 September 2026, `GET https://kaarigar.onrender.com/api/health` returned HTTP 200 with `db.connected: true` and `hasGeminiKey: true`. Key presence does not prove a successful Gemini inference.
- The current workspace has no `.env`; authenticated/database-backed local execution therefore needs environment setup.

---

# 1. Project Overview

## 1.1 What Kaarigar does

Kaarigar is an Android-oriented web prototype for skilled trade workers. Its central product is a worker-owned **Digital Kaarigar Passport**: a public, QR-shareable record that can accumulate job evidence, customer reviews, and a transparent trust-score breakdown.

The prototype also provides:

- **Kamai:** an append-only earnings and dues ledger.
- **Mol-Bhav:** cited fair-price bands for a deliberately small set of electrician and plumber tasks.
- **Job records:** a server-side lifecycle model and offline-capable creation path.
- **Customer reviews:** job-bound signed links that open without an app or customer account.
- **Income statement:** a server-generated 6- or 12-month PDF derived from ledger records.
- **Voice-assisted entry:** browser speech recognition plus Gemini extraction, with a deterministic keyword fallback.

## 1.2 Problem being addressed

The architecture identifies four failures:

1. **Invisible skill:** experienced workers cannot carry credible evidence to a new locality.
2. **Invisible income:** cash work produces no structured financial record.
3. **Opaque pricing:** workers and customers negotiate without a shared reference.
4. **Trapped reputation:** word-of-mouth and marketplace ratings do not travel with the worker.

Kaarigar's thesis is that identity is the product. Pricing, jobs, ledger entries, and reviews should create evidence for that identity instead of becoming another commission-taking marketplace.

## 1.3 Intended users

### Implemented actors

- **Kaarigar/worker:** authenticates, edits their own profile, creates jobs and ledger entries, generates review links, views pricing, and shares the passport.
- **Customer/reviewer:** does not create an account. Possession of a signed, job-bound review URL is the authorization to submit one review.

### Designed but not implemented

- Contractor/team lead
- Skill verifier, ITI, NGO, or council
- Institution/admin
- Platform operations and dispute reviewer

The reduction to two practical actors is intentional hackathon scope, not an accidental omission.

## 1.4 Core goals

- Worker-owned, portable reputation.
- Zero worker commission.
- Honest separation of phone identity, worker-entered claims, mock integrations, and evidence-backed claims.
- Offline-tolerant money and job recording.
- Transparent, cited pricing rather than an unexplained “AI price.”
- A focused two-trade, one-locality prototype that can be demonstrated reliably.

## 1.5 Major workflow currently available

The intended reduced demo story is:

1. Worker signs in through the OTP/JWT flow.
2. Worker looks up an electrician or plumber rate band.
3. Worker creates and shares an itemised quote.
4. Worker records a job and payment.
5. Customer receives a signed review link and submits four ratings.
6. Public QR passport displays review evidence and trust-score components.
7. Worker downloads a 6-month income statement.
8. A job or earning created offline queues locally and syncs after reconnection.

Run 10 connected this story to the real job state machine. Voice entry now creates `REQUESTED` work, the outbox syncs it, and the Jobs screen advances the happy path through the server transition endpoint. The remaining proof is a deployed two-phone rehearsal. See Sections 5 and 8.

---

# 2. Original Architecture

## 2.1 Architectural thesis

The PDF defines the Digital Kaarigar Passport as the anchor object. Every module should answer: **what provable claim does this add to the worker's passport?**

The original design is Android-first, offline-first, multilingual, low-literacy-oriented, and intended to work on Android 8 devices with 2 GB RAM. It targets seven days of offline endurance, visible synchronization, large tap targets, and a small application footprint.

## 2.2 Original feature modules

| Module | Original responsibility |
|---|---|
| A - Digital Passport | OTP identity, coded trades, credentials, portfolio media, endorsements, QR public page, W3C credentials |
| B - Kamai | Earnings, expenses, udhaar, OCR bill capture, summaries, 6/12-month income PDF, append-only corrections |
| C - Mol-Bhav | Seeded and observation-corrected price bands, wage floor, quote builder, negotiation explanation |
| D - Reputation and Discovery | Job-anchored reviews, four rating axes, nearby ranking, availability, disputes |
| E - Job Management | Immutable lifecycle from `REQUESTED` through `REVIEWED`, scheduling, photos, crew mode later |
| F - Financial Inclusion | Consent-mediated income sharing, scheme discovery, credit-readiness view |
| G - Skilling | Vernacular safety/upskilling content and later credentials |
| H - Access Layer | Icon-first UI, Hindi/English MVP, offline-first, low-end devices, WhatsApp, later IVR/TTS |

## 2.3 Original six-tier system

1. **Clients:** React Native worker/customer apps, Next.js public passport and admin surfaces, WhatsApp bot, SMS/IVR.
2. **Edge:** gateway, JWT/device-binding middleware, Redis rate limiting.
3. **Application:** FastAPI modular monolith with identity, passport, ledger, pricing, jobs, reputation, discovery, notification, and sync boundaries.
4. **Async workers:** Celery/Redis for media, OCR, score recomputation, fraud checks, notifications, and reports.
5. **Data:** MongoDB replica set, Redis, S3/MinIO, analytics, and an append-only audit log.
6. **External integrations:** DigiLocker, Aadhaar offline eKYC, e-Shram, maps, UPI, and official rate schedules.

## 2.4 Original technology choices

| Layer | Original design |
|---|---|
| Mobile | React Native Expo + TypeScript |
| Device database | WatermelonDB/SQLite |
| Public/admin web | Next.js App Router |
| Backend | FastAPI, Python 3.11 |
| Primary database | MongoDB 7 replica set |
| Cache/queue | Redis 7 + Celery |
| Media storage | MinIO/S3 |
| Pricing ML | LightGBM/scikit-learn, optional ONNX |
| OCR | PaddleOCR/Tesseract |
| Authentication | Phone OTP, access/refresh JWT, device binding |
| Deployment | Docker Compose to one VPS, Kubernetes-ready later |
| Observability | Prometheus, Grafana, Sentry |

## 2.5 Original data and API model

The design names collections for users, profiles, credentials, portfolio items, jobs, quotes, ledger entries, receivables, reviews, rate bands, price observations, consents, disputes, and audit events. Client-generated UUIDv7 identifiers make offline-created records stable and sortable before sync.

The representative API includes OTP, passport, credential import, ledger and reversals, income export, pricing, quotes, jobs/transitions, nearby discovery, reviews, synchronization, and consent operations.

## 2.6 Original hackathon demo loop

The PDF's full final loop is:

`certificate import -> nearby discovery -> cited quote -> accepted job -> before/after photos -> payment -> review -> trust update -> second-phone QR -> income PDF -> offline entry -> reconnect and sync`

The current project intentionally substituted or removed several beats to fit the hackathon schedule. Those differences are explicit below.

---

# 3. Current Architecture

## 3.1 Runtime topology

The current system is a single Node.js/TypeScript process:

```text
Browser / phone
  |
  +-- React 19 SPA routes --------------------------+
  |   /, /passport, /jobs, /quote, /kamai, /profile|
  |                                                  |
  +-- JSON /api/* -> Express route modules ----------+--> MongoDB
  |                                                  |
  +-- GET /p/:handle -> Express-rendered passport ---+
  |
  +-- GET/POST /r/:token -> Express review form -----+
```

In development, Express mounts Vite in middleware mode. In production, Express serves the Vite `dist/` bundle and its own bundled `dist/server.cjs`. API and public routes are registered before the SPA fallback; that order is load-bearing.

## 3.2 Implemented technology stack

| Concern | Actual implementation |
|---|---|
| Client | React 19, TypeScript, Vite 6, Tailwind 4, React Router 7 |
| Mobile delivery | Responsive PWA-style web application; no native APK or service worker |
| Server | Express 4 + TypeScript in the same repository and process |
| Database | MongoDB through the official Node driver |
| Client persistence | `localStorage` for auth, non-API fixtures, and offline outbox |
| Authentication | Custom OTP challenges + signed JWT access/refresh tokens |
| Public pages | Express-generated HTML with inline CSS; QR as inline SVG |
| AI | Google Gemini through `@google/genai`, model string `gemini-3.7-flash`, plus keyword fallback |
| Speech | Browser `SpeechRecognition`/`webkitSpeechRecognition` and `speechSynthesis` |
| PDF | Small server-side dependency-free PDF writer for income statements |
| Deployment | Render single Node service, Singapore region |
| Build | Vite client build + esbuild server bundle |

There is no Redis, Celery, object storage, Next.js, FastAPI, WatermelonDB, native Android package, ML pricing model, or OCR pipeline.

## 3.3 Frontend structure and state flow

`src/main.tsx` mounts `BrowserRouter`, `AuthProvider`, and `App`. `src/App.tsx` owns three domain slices:

- `WorkerProfile`
- `JobItem[]`
- `KamaiEntry[]`

There is no Redux or Zustand. Domain data is passed as props. Authentication is the only Context-backed state.

`VITE_USE_API` controls which screens use Mongo-backed APIs. `render.yaml` compiles it as `all`, so the deployed build is intended to use the API for profile, jobs, and Kamai. When a domain is API-backed, its old localStorage fixture key is no longer written.

Job and ledger creation are optimistic and offline-tolerant:

```text
voice confirmation
  -> update React state immediately
  -> enqueue UUIDv7 job
  -> enqueue linked ledger entry after the job
  -> localStorage outbox survives reload
  -> flush on startup, online event, manual retry, or 30-second timer
  -> POST /api/sync/batch (maximum 50)
  -> accepted/duplicate removed; retryable kept; permanent rejection marked failed
```

Profile updates are different: they optimistically patch the API and roll back on failure. They are not queued for offline synchronization.

Important frontend files:

| File | Responsibility |
|---|---|
| `src/App.tsx` | Auth gate, domain loading, routing, save handlers, income download |
| `src/auth/AuthProvider.tsx` | Restore session, schedule refresh, sign out |
| `src/lib/api.ts` | Typed API client and wire-format unwrapping |
| `src/lib/outbox.ts` | Persistent offline job/ledger queue and single-flight flush |
| `src/hooks/useOutbox.ts` | React view of queue state |
| `src/lib/featureFlags.ts` | Build-time per-screen API switch |
| `src/lib/dataSource.ts` | Maps screen flags to shared profile/jobs/Kamai domains |
| `src/lib/passportLink.ts` | Keeps shared passport links aligned with server origin |
| `src/components/QuoteBuilder.tsx` | Client-only cited quote calculation/share/download |
| `src/components/VoiceAssistantModal.tsx` | Voice/text workflow and confirmation |
| `src/components/DigitalPassport.tsx` | In-app QR passport and trust breakdown |

## 3.4 Backend structure

`server.ts` is bootstrap-only. `src/server/routes/index.ts` mounts service-aligned routers. Route modules own HTTP concerns; `src/server/data/*.ts` own validation and persistence. Online routes and offline sync deliberately reuse the same data functions.

### Endpoint inventory

| Method | Endpoint | Auth | Current behavior |
|---|---|---|---|
| GET | `/api/health` | No | Dependency presence, safe DB category, public origin |
| POST | `/api/auth/otp/request` | No | Hashed 5-minute challenge; SMS delivery is stubbed to server log |
| POST | `/api/auth/otp/verify` | No | Consumes challenge, upserts user, returns JWT pair |
| POST | `/api/auth/refresh` | No | Rotates refresh token; reuse revokes family |
| GET | `/api/auth/me` | Yes | Returns authenticated identity |
| GET | `/api/passport/me` | Yes | Owner profile; auto-creates on first read; calculates trust score |
| PATCH | `/api/passport/me` | Yes | Allowlisted profile fields only |
| GET | `/api/jobs` | Yes | Owner-scoped jobs, optional status filter |
| POST | `/api/jobs` | Yes | Idempotent UUID creation |
| POST | `/api/jobs/:id/transition` | Yes | Enforces `JOB_TRANSITIONS` for an existing job |
| GET | `/api/ledger/entries` | Yes | Owner ledger, optional period |
| POST | `/api/ledger/entries` | Yes | Idempotent append-only entry |
| GET | `/api/ledger/summary` | Yes | Earned, owed, net, outstanding, payment split |
| POST | `/api/ledger/export/income-statement` | Yes | 6/12-month PDF response |
| POST | `/api/ledger/entries/:id/reverse` | Yes | Adds a negative reversing entry; original unchanged |
| POST | `/api/sync/batch` | Yes | Causal, per-item, idempotent job/ledger ingest |
| GET | `/api/pricing/tasks` | Yes | Distinct trade/task pairs from the DB |
| GET | `/api/pricing/band` | Yes | Seeded/observed/suppressed band with wage-floor metadata |
| POST | `/api/assistant/process` | Yes | Gemini/fallback extraction, 2,000-char limit, rate limited |
| POST | `/api/reviews/link` | Yes | Owner-scoped signed link for a reviewable job |
| POST | `/api/reviews` | Signed token | JSON review submission |
| GET | `/p/:handle` | No | Server-rendered public passport and QR |
| GET/POST | `/r/:token` | Signed token | No-JS customer review form and submission |

An unmatched `/api/*` returns a JSON 404 rather than the SPA HTML shell.

## 3.5 Database and schemas actually used

MongoDB is the operational store. Indexes are created lazily by the modules that own each collection.

| Collection | Purpose and important indexes |
|---|---|
| `users` | Unique phone; roles; refresh JTI/family/revocation state |
| `otp_challenges` | TTL expiration; phone/creation lookup; hashed OTP only |
| `kaarigar_profiles` | Unique `userId`; unique `passportHandle` |
| `jobs` | Owner/date and owner/status; state history |
| `ledger_entries` | Profile/date, direction, unique partial `reversesId` |
| `rate_bands` | Unique trade/task/locality; ten current CSV seeds |
| `reviews` | Unique `jobId`; subject/date |

Not present: `credentials`, `portfolio_items`, `quotes`, `receivables`, `price_observations`, `consents`, `disputes`, `audit_log`, or analytics collections.

The trust score is computed at read time; it is not persisted. Receivables are approximated using `direction: 'out'` and optional `settledAt` on ledger records rather than a separate collection.

## 3.6 Authentication and authorization

- Indian E.164 phone format is required.
- OTPs are generated cryptographically, stored as HMAC hashes, expire after five minutes, allow five attempts, and are single-use.
- At most three challenges per phone are allowed inside the OTP window.
- **Actual SMS delivery is not implemented.** Development returns `devCode`; production logs the code server-side.
- A stage-only fixed OTP can be enabled for exactly one configured phone through `DEMO_OTP_ENABLED`, `DEMO_OTP_PHONE`, and `DEMO_OTP_CODE`.
- Access JWTs last 15 minutes. Refresh tokens rotate and use family reuse detection.
- `requireAuth` is the only bearer-verification boundary.
- Object ownership is embedded in Mongo filters. Another user's object normally appears as 404, not 403.
- Auth tokens are stored in browser localStorage, which is an accepted prototype trade-off and an XSS risk for production.

Firebase phone authentication is abandoned after repeated `INVALID_APP_CREDENTIAL` failures. The dependency remains in `package.json` but no source file imports it.

## 3.7 Pricing

`data/rate-bands.csv` contains ten job-sized bands:

- Five electrician tasks
- Five plumber tasks
- Daily skilled-wage floor of Rs 862 in the current rows
- Citations to CPWD DSR items and/or the Delhi Labour Department order
- `sampleN: 0`, honestly showing no local transaction observations

The server treats cited zero-observation rows as `seeded`, not `observed`. A band with neither observations nor a citation is suppressed. The price API applies the statutory floor only where it considers units comparable.

The CSV carries a `unit` column, but `RateBand` does not. The seeder therefore does not persist the unit. The current MVP avoids per-square-foot and per-metre tasks.

## 3.8 Reputation and trust

Reviews require a signed HMAC token bound to one existing `COMPLETED` or `SETTLED` job. The `reviews.jobId` unique index makes the link single-use. The customer gives workmanship, punctuality, price honesty, and cleanliness ratings.

The current trust score uses evidence the prototype owns:

- Phone identity: fixed 10/20
- Skill credentials: 0/15
- Completed work: 3 points per completed job, capped at 15/25
- Customer ratings: Bayesian-adjusted, up to 25/25
- Reliability: cancellation penalty from 0 to -10
- Skilling: 0/5

The score deliberately does not treat worker-entered certificates as verified. DigiLocker is displayed only as a labelled sandbox/mock state.

Run 10 closed the initial-state bypass: ordinary creation accepts only `REQUESTED`, state history begins there, and every later state is checked by the transition endpoint. Regression coverage rejects direct `COMPLETED` creation and illegal jumps.

## 3.9 AI and voice

`POST /api/assistant/process` requires auth, limits input to 2,000 characters, and uses an in-memory per-IP/per-user limiter of 20 requests per minute.

The response is a discriminated union:

- `source: 'gemini'`
- `source: 'fallback'` with `fallbackReason`

The deployed health endpoint confirms only that a Gemini key is present. **Needs verification:** execute representative live prompts and confirm `source: 'gemini'`; also confirm that `gemini-3.7-flash` is accepted by the configured account.

Speech recognition and text-to-speech depend on browser APIs. Compatibility varies across Android browsers; Chrome is the intended demo browser.

## 3.10 Deployment and operations

- Render deploys one Node service in Singapore.
- Build: `npm ci --include=dev && npm run build`.
- Start: `npm start`.
- Production uses `VITE_USE_API=all`.
- `/api/health` is the Render health path.
- `.github/workflows/keep-warm.yml` is manual-only.
- README prescribes an UptimeRobot keyword monitor for `"connected":true`; **Needs verification:** whether that external monitor is actually configured and alerting.
- There is no CI test workflow, centralized logging dashboard, Sentry, Prometheus, or Grafana.

---

# 4. Original Architecture vs. Current Implementation

| Area | Original design | Current implementation | Status/reason |
|---|---|---|---|
| Client | React Native Android app plus Next.js surfaces | One responsive React/Vite SPA plus Express SSR pages | Intentional hackathon amendment; avoids a rewrite |
| Backend | FastAPI modular monolith | Express/TypeScript modular monolith | Intentional; service boundaries retained |
| Device store | WatermelonDB/SQLite | localStorage fixtures and outbox | Temporary prototype shortcut |
| Offline | All reads/writes local-first for seven days | Jobs/ledger queue locally; profile and remote reads do not | Partial |
| Roles | Six roles | Worker plus token-authorized customer reviewer | Intentional scope reduction |
| Authentication | Delivered phone OTP, device binding, JWT | OTP lifecycle and JWT are real; SMS delivery and device binding absent | Partial/stubbed |
| Passport | Credentials, photos, endorsements, W3C credentials | Profile, QR public page, reviews, transparent trust breakdown | Partial |
| Credential verification | DigiLocker/Aadhaar/e-Shram | Clearly labelled sandbox/mock and `Not linked` | Intentional demo substitution |
| Discovery | Nearby geo ranking and availability | No discovery; customer opens a worker's QR/link | Intentional substitution |
| Pricing | Government seed plus observation re-fitting/ML | Ten static cited job bands; no live correction | Partial, intentionally honest |
| Quote | Persisted quote and shareable link/PDF | Client-only calculation; share text or download `.txt` | Partial |
| Jobs | Full immutable lifecycle with photos | Backend transition endpoint exists; UI bypasses it on creation | Partial and integrity-sensitive |
| Ledger | Append-only entries, reversals, summaries, receivables | Core backend and PDF exist; UI is income-centric and mis-handles out/reversal display | Partial |
| Reviews | Authenticated customer against completed booking | Signed possession link against completed job | Intentional substitute for customer account |
| Trust | Published rubric with fairness and appeals | Smaller evidence-based computed rubric; no appeals/disputes | Partial |
| Reports | Async quote and income PDFs in object storage | Synchronous one-page income PDF in memory | Complete for reduced demo scope |
| Async/data platform | Redis, Celery, S3, audit and analytics | None | Deferred |
| AI/ML | LightGBM pricing, OCR, fraud/media checks | Gemini voice extraction plus rule fallback | Pricing/OCR/fraud ML not started |
| Access | Hindi/English MVP, native low-end target | Five language codes and responsive web; translations are uneven | Partial |
| Voice | Earlier design explicitly deferred voice | Voice retained as first-class input | Ratified amendment because working code already existed |

## Decisions that must not be accidentally reverted

1. Keep `registerRoutes(app)` before Vite middleware and the production SPA catch-all.
2. Keep the Express/TypeScript modular-monolith decision for this prototype; do not start a FastAPI port during demo hardening.
3. `src/types.ts` is the frozen cross-track contract. Change it only through an explicit team decision.
4. `getAuthToken()` remains synchronous; changing it cascades through every client request.
5. Keep one refresh owner/timer in `AuthProvider`; concurrent refresh attempts can trigger reuse detection.
6. Preserve 404 behavior for cross-user object probes.
7. Route all collection access through the owning `data/*.ts` module when a shared access path exists.
8. Keep ledger corrections append-only. Never add update/delete for financial entries.
9. Keep job and ledger UUIDs client-generated and idempotent.
10. Preserve job-before-ledger causal ordering in both client outbox and server batch handling.
11. Permanently rejected outbox items must not retry forever or disappear silently.
12. Never promote self-entered skills or certificates into verified evidence.
13. Never add a server secret with a `VITE_` prefix.
14. Preserve per-request public-origin resolution or `PUBLIC_ORIGIN`; QR and shared URLs must use the same host.
15. Keep rate provenance travelling with every displayed number; `seededFrom` is not decorative.
16. Do not add per-area/per-length tasks until `RateBand` has an agreed unit model.
17. Do not silently reintroduce Firebase phone auth investigation; its failure analysis is already recorded in README.
18. Stay with electrician and plumber for the SIH prototype unless the team explicitly changes scope.

---

# 5. Implementation Progress

The classifications below describe what a user can actually do now.

| Feature/component | Classification | What works and what does not |
|---|---|---|
| Express/Vite deployment | **Completed** | One process serves API, SSR pages, and SPA; Render health currently passes |
| Mongo connection and recovery | **Completed** | Safe health categories and background reconnect with exponential backoff |
| OTP/JWT session security | **Partially implemented** | Challenge, hashing, attempts, rotation, and reuse detection work; SMS and device binding do not |
| Login UI/session restoration | **Completed for reduced scope** | Worker can log in and restore/refresh a session when OTP is obtainable |
| Worker profile persistence | **Completed for reduced scope** | Owner-scoped profile read/create/update with protected derived fields |
| Public passport and QR | **Completed for reduced scope** | No-login SSR page, privacy projection, QR, reviews, trust breakdown |
| Passport PDF/ID download | **Not started** | In-app button only calls `alert()` |
| Credential verification | **Deprecated as live integration for this prototype** | Only honest sandbox/mock state; no DigiLocker/Aadhaar/e-Shram call |
| Job data model and transition API | **Completed for reduced scope** | Creation is locked to `REQUESTED`; legal transitions are server-enforced and regression-tested |
| Job lifecycle UI | **Completed for reduced scope** | Synced jobs expose the single happy-path transition through the typed API client |
| Job voice entry | **Completed for reduced scope** | Creates a `REQUESTED` job only; payment/income is recorded separately |
| Tap-entry form | **Not started/Needs verification** | No standalone under-15-second tap form is present; current add paths are voice/text modal |
| Append-only ledger backend | **Completed** | Idempotent entry creation, summaries, reversals, owner scope |
| Kamai UI | **Partially implemented** | Displays entries and sync state, but totals/display do not correctly account for `direction`, negative reversals, week/month periods, or outstanding state |
| Income statement PDF | **Completed for reduced scope** | Server creates one-page 6/12-month PDF with earned, owed, net, outstanding, and record count |
| Rate CSV and seeding mechanism | **Completed** | Ten cited rows, seeder safeguards, DB check command |
| Live rate database state | **Needs verification** | Last Run 8 temporary-DB check reported 10 sourced and 0 unsourced; current production contents were not authenticated and rechecked for this handoff |
| Quote builder | **Partially implemented** | Selects ten supported tasks, loads band, calculates charges, shares text/downloads `.txt`; no persisted quote, job link, PDF, or server endpoint |
| Customer review link | **Completed for reduced scope** | Signed owner-scoped link, no-JS form, four axes, one review per job |
| Trust-score breakdown | **Partially implemented** | Transparent server computation and UI; lifecycle bypass is closed, but photo/customer identity evidence remains outside scope |
| Offline outbox | **Partially implemented** | Job/ledger writes survive reload and sync visibly; profile, rate reads, auth, quote, and review remain online-dependent |
| Voice/Gemini | **Partially implemented** | Authenticated endpoint and explicit fallback; successful production Gemini path still needs a prompt-level check |
| Localisation | **Partially implemented** | Hindi, Punjabi, Kannada, Marathi, English types/copy exist; coverage and quality are inconsistent |
| Nearby discovery | **Not started** | QR/link substitution is the chosen demo path |
| Media portfolio/photos | **Not started** | No capture, upload, geotag, storage, or pHash |
| W3C verifiable credentials | **Not started** | Roadmap only |
| Financial consent/lending bridge | **Not started** | Roadmap only |
| Redis/Celery/S3/OCR/fraud detection | **Not started** | Roadmap only |
| Admin/contractor/verifier/skilling/IVR | **Not started** | Explicitly excluded from hackathon build |
| Firebase client integration | **Deprecated/abandoned** | Dependency remains but has no imports |
| Run 9 repository cleanup | **Completed locally, unpublished** | Exact cleanup is ready on `codex/sih-mvp`; no commit or push was made |
| Two-phone deployed rehearsal | **Needs verification** | Code paths exist, but the full current build has not been independently re-run during this handoff |

---

# 6. Important Technical Decisions

## 6.1 Technology and structure

- Reuse the working TypeScript stack instead of introducing Python and Next.js under deadline.
- Preserve service boundaries with route/data modules even though they deploy together.
- Keep public passport and review pages server-rendered, dependency-light, and usable without JavaScript.
- Keep deployment as one Render service until real scale justifies separation.

## 6.2 Data and identifiers

- UUIDv7 is used for durable client/server records; UUIDv4 remains acceptable for short-lived OTP challenges.
- Jobs and ledger inserts are idempotent on `_id`.
- Cross-user ID collisions return generic 409 responses rather than 500 or ownership disclosure.
- Ledger entries are immutable; a correction is a negative reversing entry linked by `reversesId`.
- Index creation is lazy rather than migration-managed. This is convenient for the prototype but should become explicit migrations before a pilot.

## 6.3 State management and offline behavior

- React state is the immediate UI source.
- MongoDB is the intended system of record when `VITE_USE_API=all`.
- localStorage outbox provides offline job/ledger creation, visible `pending/synced/failed`, and single-flight flush.
- A permanently invalid row remains visible as failed; it is not endlessly retried.

## 6.4 Authentication and security

- OTP delivery was separated from the auth/session contract, allowing a stub without weakening JWT lifecycle logic.
- Owner scope belongs inside DB filters.
- Public profiles use a projection that excludes phone, income, daily rate, blood group, and internal IDs.
- Review tokens use HMAC, timing-safe comparison, expiry, job binding, and a unique review index.
- `REVIEW_LINK_SECRET` may be distinct or derived from `JWT_SECRET` using a fixed label.
- Server error details stay in logs; unauthenticated health returns only safe categories.

## 6.5 Pricing and AI honesty

- A cited seed with zero observations is labelled `seeded`, never presented as locally learned.
- The current “AI” claim belongs to voice extraction, not price prediction.
- Gemini and fallback responses are distinguishable in the API.
- DigiLocker, e-Shram, WhatsApp, and UPI must be called simulated or future integration, never live.

## 6.6 Error handling

- API client distinguishes network loss, 401, validation fields, and server errors.
- 401 triggers centralized sign-out.
- Sync reports per-item acceptance and retry classification.
- Public route failures return real HTML status pages instead of the SPA shell.

## 6.7 Testing and verification

Available commands:

- `npm run lint` - strict TypeScript type-check, no emit.
- `npm run build` - Vite client plus esbuild server.
- `npm run check:tree` - ensures relative imports resolve to tracked files.
- `npm run test:regressions` - 48 HTTP/in-process regression assertions against a running non-production server and writable MongoDB.
- `npm run check:rates` - checks database citation presence, not citation truth.

Last known evidence:

- Run 9: lint, build, tree, and diff checks passed.
- Run 11: 48 regressions passed against a temporary local MongoDB.
- Run 11: rate check reported 10 sourced and 0 unsourced against that temporary DB.

There is no general unit-test framework and no automatic CI workflow. Regression tests create records and therefore must use a disposable/local database unless production writes are explicitly authorized.

## 6.8 Git and collaboration rules

- Active work is restricted to `codex/sih-mvp` unless the owner explicitly says otherwise.
- **Never commit without explicit owner permission.**
- Never push to `upstream`; branches may be pushed only to `origin`.
- Before significant implementation, fetch `upstream` and compare `HEAD...upstream/main`.
- If upstream has new commits: alert the owner, summarize them, identify overlap with current files, and wait. Do not merge, rebase, pull, reset, switch, or push automatically.
- Preserve unrelated user changes in a dirty working tree.

---

# 7. Known Issues and Technical Debt

## 7.1 Critical before a serious demo

1. **Runs 9-11 are not published.** The official repository remains unchanged until the cleanup, lifecycle, and rehearsal-preparation work are explicitly committed, pushed to `origin`, and merged through a reviewed PR.
2. **Previously displayed MongoDB, Gemini, and JWT credentials need rotation.** Current source scanning found no live values, but screenshot exposure is external to Git and cannot be undone by repository cleanup.
3. **The deployed demo has not been rehearsed from two phones.** The deterministic seed and runbook now exist and passed locally, but production data/environment and the full customer review flow remain unverified.

## 7.2 High-priority functional debt

- Kamai now respects incoming/outgoing direction, negative reversals, actual
  day/last-seven-day/month periods, and outstanding state. It still derives
  presentation client-side instead of consuming the server summary endpoint.
- A small typed-payment fallback now creates an offline-capable income entry
  without depending on speech recognition or Gemini.
- Quote output is ephemeral text; there is no quote collection, API, PDF, expiry, band snapshot persistence, or job association.
- The in-app passport download button is an alert, not a generated document.
- `rating`, `totalJobsCount`, and `totalEarnings` displayed from the stored profile can drift from actual jobs/reviews/ledger. The trust score is derived, but headline profile statistics are not recomputed.
- Credential strings can be entered by the worker. The UI labels them honestly, but legacy `verifiedStatus` values in the database could still produce a `VERIFIED` badge without a current verification pipeline.
- Profile changes are not offline-queued.
- The quote and rate lookup require authentication and network access.

## 7.3 Security and operational debt

- Tokens live in localStorage and are exposed if client-side XSS occurs.
- OTP delivery logs plaintext codes server-side. This is acceptable only for a labelled prototype.
- Assistant rate limiting is in-process; multiple instances would maintain independent counters.
- No CSRF strategy is needed for bearer JSON APIs, but the public review form relies on an unguessable signed URL rather than a separate CSRF token.
- No device binding, field-level encryption, audit log, consent ledger, erasure workflow, or break-glass controls.
- No pagination on jobs, ledger, reviews, or rate task enumeration.
- Mongo indexes are created lazily with module booleans and no migration history.
- `npm run clean` uses `rm -rf`, which is not native PowerShell-friendly.
- The Firebase dependency is unused bundle/dependency surface and should be removed only after confirming no planned retry.
- `vite.config.ts` contains a visibly mis-encoded dash in a comment; harmless but untidy.
- Bundle-size warning remains; code splitting is deferred.
- UptimeRobot configuration is outside the repository and unverified.
- No automatic CI, Sentry, structured logging, or performance measurements against the PDF's NFR targets.

## 7.4 Documentation debt

- README still says the public OTP harness and placeholder rates are present; both claims are stale.
- Historical audit/gap documents describe the pre-migration prototype and should not be read as current implementation status.
- Several comments refer to old “Day N” ownership and work that has already landed.
- The PDF's policy and compliance statements are aspirational; the prototype is not DPDP-ready.

---

# 8. Remaining Work - Prioritized Roadmap

## Critical next steps

1. **Close Run 9 safely.** Review the 3,535-file cleanup diff, obtain explicit commit permission, commit on `codex/sih-mvp`, push only to `origin`, and merge through a PR. Rotate the exposed MongoDB, Gemini, and JWT credentials through their owning services and update Render.
2. **Run a deployed two-phone rehearsal.** Validate worker login, quote, lifecycle, payment, review, QR, trust update, PDF, offline entry, reconnect, and sync.
3. **Verify Kamai on the deployed build.** Confirm typed and voice payments
   produce the same totals as the six-month PDF.

## High priority

1. Confirm a production assistant request returns `source: 'gemini'` and record browser/device compatibility.
2. Decide whether the quote remains demo-only text or becomes a persisted quote. Do not build a large quotation subsystem.
3. Replace the passport download alert or remove the misleading button.
4. Derive headline rating/job/earnings figures from evidence instead of stale profile fields.
5. Verify the UptimeRobot monitor and team access to its alerts.

## Medium priority

1. Remove unused Firebase dependency and stale README sections after team confirmation.
2. Add pagination and input-length limits to list/profile fields.
3. Add automated CI for lint, build, tree check, and regression tests with an ephemeral Mongo service.
4. Code-split the frontend bundle.
5. Replace lazy index creation with explicit database migrations.
6. Add structured server logs and basic error monitoring.
7. Improve translation coverage and accessibility checks on small Android screens.

## Nice-to-have/post-hackathon

- Per-field passport visibility.
- Photo/media portfolio and object storage.
- Real DigiLocker/e-Shram integration through authorized APIs.
- Geo discovery and availability ranking.
- Persisted quotes and price observations.
- Dispute and appeal workflow.
- Consent artifacts and financial sharing.
- Native React Native/SQLite client if pilot evidence justifies it.
- Contractor, verifier, institution, and skilling surfaces.

Dependencies:

```text
Run 9 publication + secret rotation
             |
             v
lifecycle/seed integrity -> deterministic demo data
             |
             v
deployed two-phone rehearsal -> final audit/freeze
```

---

# 9. Development Setup

## 9.1 Prerequisites

- Windows, macOS, or Linux
- Node.js 20 or newer; Node 24 was observed working during this handoff
- npm; `package-lock.json` is authoritative
- A MongoDB Atlas cluster or disposable local MongoDB compatible with the Node driver
- Optional Gemini API key for real model extraction
- Git with the `origin` fork and `upstream` canonical remotes configured

On Windows PowerShell, if `npm.ps1` is blocked by execution policy, either use `npm.cmd` for commands or apply an organization-approved execution policy. Do not change machine policy merely to work around a project error without understanding the impact.

## 9.2 Fresh setup

```powershell
cd C:\Dev\Kaarigar
git branch --show-current
npm ci
Copy-Item .env.example .env
```

Fill `.env` locally. Never commit it.

## 9.3 Environment variables

| Variable | Secret? | Purpose |
|---|---:|---|
| `MONGODB_URI` | Yes | Mongo connection string |
| `MONGODB_DB_NAME` | No | Optional database name; defaults to `kaarigar` |
| `JWT_SECRET` | Yes | Access/refresh token signing and OTP HMAC; minimum 32 chars |
| `GEMINI_API_KEY` | Yes | Server-side Gemini client |
| `REVIEW_LINK_SECRET` | Yes | Optional dedicated review-link HMAC key; otherwise derived from JWT secret |
| `PUBLIC_ORIGIN` | No | Pins QR/review URLs to the deployed origin |
| `DEMO_OTP_ENABLED` | No | Enables one-phone demo bypass only when exactly `true` |
| `DEMO_OTP_PHONE` | Sensitive identifier | The single E.164 number eligible for demo OTP |
| `DEMO_OTP_CODE` | Yes | Fixed six-digit demo code; never expose or commit |
| `VITE_USE_API` | No | Build-time API screen selection; production declares `all` |
| `VITE_FIREBASE_*` | Public client config | Legacy Firebase web settings; currently unused by source |
| `PORT` | No | Server port; defaults to 3000 |
| `NODE_ENV` | No | `production` serves built assets; other values use Vite middleware |
| `DISABLE_HMR` | No | AI Studio-era option to disable HMR/file watching |
| `TEST_BASE_URL` | No | Regression-suite target; defaults to `http://localhost:3000` |

Rotate `MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `REVIEW_LINK_SECRET`, and the demo OTP after exposure or before a real pilot. JWT/review-secret changes invalidate existing tokens/links.

## 9.4 Run locally

```powershell
npm run dev
```

Open <http://localhost:3000> and check:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

The server starts without Mongo or Gemini, but database/auth routes will fail and assistant requests will fall back. A running server is not proof of a working environment; inspect the health JSON.

## 9.5 Build and static verification

```powershell
npm run lint
npm run build
npm run check:tree
```

The current bundle-size warning is non-fatal.

## 9.6 Database setup and seeds

Do not point seed or regression commands at production unless the owner explicitly authorizes writes.

```powershell
npm run seed
npm run seed:rates
npm run check:demo-seed
npm run check:rates
```

Warnings:

- `npm run seed -- --reset` drops four collections. Treat it as destructive.
- `npm run seed:rates -- --reset` drops the `rate_bands` collection.
- `check:demo-seed` verifies that the account, passport, jobs, and ledger share the intended owner IDs.
- `check:rates` proves citations are present, not correct. Manually spot-check official sources.

## 9.7 Regression tests

Start a non-production server against a disposable MongoDB in one terminal, then in another:

```powershell
npm run test:regressions
```

The suite writes users, jobs, OTP challenges, profiles, and ledger rows. Use an isolated database and clean only exact IDs created by the test. Never use a broad field-filter cleanup.

## 9.8 Deployment considerations

- Render requires dev dependencies during build because Vite, TypeScript, and esbuild are dev dependencies.
- Vite variables are compiled at build time; changing `VITE_USE_API` or Firebase client settings requires redeployment, not restart.
- `PUBLIC_ORIGIN` should be set before printing or screenshotting permanent QR codes.
- Verify `/api/health`, database connectivity, Gemini source, review links, and PDF download after every deployment.
- Never expose environment values in screenshots, terminal recordings, or presentation slides.

---

# 10. Repository Navigation Guide

| Path | What to look for |
|---|---|
| `Kaarigar_Architecture_v1.pdf` | Original product/system design baseline |
| `MIGRATION_PLAN.md` | Ratified Express, voice, localStorage, scope, and team-boundary amendments |
| `HANDOFF.md` | Current implementation truth and continuation context |
| `server.ts` | Process bootstrap and dev/prod static handling only |
| `src/types.ts` | Frozen cross-track domain contract and job state machine |
| `src/server/routes/index.ts` | Route mount table and required ordering |
| `src/server/routes/identity.ts` | OTP and refresh-token flow |
| `src/server/routes/passport.ts` | Owner profile API and trust-score attachment |
| `src/server/routes/jobs.ts` | Job lists and transition endpoint |
| `src/server/routes/ledger.ts` | Entries, summary, reversal, income PDF endpoint |
| `src/server/routes/pricing.ts` | Band confidence, suppression, wage-floor behavior |
| `src/server/routes/reputation.ts` | Review token gate and link minting |
| `src/server/routes/public.ts` | SSR passport and customer review pages |
| `src/server/routes/sync.ts` | Offline batch ingest and retry classification |
| `src/server/routes/assistant.ts` | Gemini prompt, parsing, fallback, rate limit |
| `src/server/data/*.ts` | Shared persistence and validation rules |
| `src/server/data/trustScore.ts` | Evidence-based prototype rubric |
| `src/server/lib/incomeStatementPdf.ts` | One-page PDF generator |
| `src/server/lib/reviewToken.ts` | HMAC review URL format and validation |
| `src/App.tsx` | Central client domain state and write handlers |
| `src/lib/api.ts` | Client endpoint interface |
| `src/lib/outbox.ts` | Persistent offline queue |
| `src/components/QuoteBuilder.tsx` | Current non-persisted quotation experience |
| `src/components/KamaiView.tsx` | Ledger presentation and known calculation debt |
| `src/components/JobsView.tsx` | Job cards, status badges, review-link access |
| `src/components/DigitalPassport.tsx` | In-app passport, QR, trust, mock credentials |
| `src/components/VoiceAssistantModal.tsx` | Voice/text data capture; job entry starts at `REQUESTED` |
| `src/data/initialData.ts` | Demo fixtures reused by `scripts/seed.ts` |
| `data/rate-bands.csv` | Ten source-carrying MVP bands |
| `scripts/seed.ts` | Idempotent demo seed with user-owned jobs |
| `scripts/check-demo-seed.ts` | Read-only demo account/profile/job/ledger ownership verification |
| `scripts/seedRateBands.ts` | Citation-aware rate seeder |
| `scripts/check-rates.ts` | Database rate-citation check |
| `scripts/test-regressions.ts` | 48 regression checks, including lifecycle, ledger, review, and derived passport-evidence integrity; requires writable test DB |
| `DEMO_RUNBOOK.md` | Frozen API-backed setup, safe reset, stop conditions, and judge flow |
| `scripts/check-tree.ts` | Import/tracked-file integrity check |
| `render.yaml` | Render build/runtime configuration and demo API flag |
| `.github/workflows/keep-warm.yml` | Manual pre-demo health ping, not continuous monitoring |
| `.env.example` | Canonical environment-variable inventory without values |

`AUDIT_REPORT.md` and `GAP_MATRIX.md` are useful history but describe an earlier prototype state. Do not use them as a current feature checklist.

---

# 11. Important Constraints and Invariants

Future developers and AI assistants must preserve these rules:

- Do not commit, push, merge, rebase, reset, pull, switch branches, or change Git configuration without the authority appropriate to that operation. The current owner specifically requires explicit permission before every commit.
- Never push to the canonical `upstream` remote.
- Check upstream before significant implementation and stop if new commits overlap current work.
- Work on `codex/sih-mvp` unless explicitly instructed otherwise.
- Do not expose secret values. `.env.example` contains names and documentation only.
- Do not test write flows against production by default.
- Do not call self-entered credentials verified.
- Do not claim DigiLocker, Aadhaar, e-Shram, WhatsApp, or UPI integration is live.
- Do not expand beyond electrician and plumber during SIH hardening.
- Do not introduce per-unit rate tasks without a unit-aware contract and wage-floor rule.
- Do not replace the append-only ledger with editable rows.
- Do not make the outbox silently discard or endlessly retry invalid money records.
- Do not let the SPA catch-all shadow `/api`, `/p/:handle`, or `/r/:token`.
- Do not broaden the public passport projection to phone, income, health data, internal IDs, or daily rate.
- Do not use stored profile ratings/counts as verified evidence without deriving them from jobs/reviews.
- Treat `createJob` initial-state behavior as a trust boundary.
- Preserve exact-ID cleanup for test/demo data.
- Prefer a reliable end-to-end demonstration over new architecture or feature expansion.

---

# 12. Recommended Next Development Session

## Run 11 - deployed two-phone rehearsal

Run 10 is complete locally. Run 11's disposable local rehearsal passed 22 ownership
checks, 10/10 cited-rate checks, 48 API regressions, demo-account API visibility,
and a real browser lifecycle from voice entry through `SETTLED`.

Run 11 coding preparation corrected Kamai's direction/reversal/period rendering,
removed invented forecast claims, added a typed-payment fallback, and declared
the missing preview deployment environment settings. The deployed two-phone
rehearsal remains the completion gate.

### Objective

Prove the same story on the deployed Render build with one worker phone and one
customer phone, without direct database intervention.

### Required flow

1. Confirm deployed health and `VITE_USE_API=all`.
2. Sign in as the seeded worker.
3. Check a cited rate and generate a quote.
4. Create one job; confirm it starts at `REQUESTED` and syncs.
5. Advance it through the on-screen lifecycle.
6. Log payment separately.
7. Generate a signed review link and open it on the customer phone.
8. Submit the four-axis review and verify public passport/trust evidence.
9. Download and inspect the six-month income PDF.
10. Create an earning offline, reconnect, and show the sync badge clear.

### Dependencies and stop conditions

- Obtain explicit commit/push/deployment permission; current Run 9/10 work is uncommitted.
- Rotate the previously exposed secrets before using shared infrastructure.
- Do not run reset seeds against production without explicit authorization.
- Stop if health is disconnected, the new job appears completed on creation,
  lifecycle controls remain disabled after sync, or the customer review cannot
  change public evidence.

Next, obtain explicit permission for publication/deployment, rotate the exposed
secrets, complete Run 11's physical deployed two-phone rehearsal, and then run
Run 12's final audit, freeze, and handoff.

---

# Context for the Next AI Assistant

Kaarigar is an SIH 2026 prototype for skilled trade workers, currently limited to electrician and plumber. Its central product is a worker-owned public Digital Kaarigar Passport. Jobs, reviews, pricing, and income records are supposed to add evidence to that passport. The project intentionally takes no worker commission and must distinguish real evidence from worker-entered or simulated claims.

The original PDF proposed React Native, Next.js, FastAPI, WatermelonDB, Redis/Celery, S3, broad roles, discovery, photos, government integrations, ML pricing, OCR, and consent/audit infrastructure. The implemented prototype is one React 19/Vite SPA plus an Express/TypeScript server and MongoDB, deployed as one Render service. Express also serves no-JS public passport and customer-review pages. The deviations are deliberate hackathon scope decisions recorded in `MIGRATION_PLAN.md`.

Implemented: custom OTP challenge and JWT session lifecycle, Mongo-backed profiles/jobs/ledger/rates/reviews, append-only reversals, UUIDv7 idempotency, offline localStorage outbox for jobs/ledger, cited ten-task rate lookup, client quote builder, signed job-bound review links, public QR passport, transparent trust-score breakdown, labelled DigiLocker mock, and a server-generated 6/12-month income PDF. Gemini voice extraction has an explicit keyword fallback. Render health currently reports DB connected and a Gemini key present.

Not implemented: actual SMS delivery, device binding, native Android/SQLite, geo discovery, photos/portfolio media, real certificates/government APIs, persistent quotes, price learning, OCR, fraud detection, consent/audit logs, disputes/appeals, admin/contractor/verifier roles, or full observability. Firebase phone auth is abandoned; its dependency is currently unused.

Run 10 resolved the job-integrity blockers: creation is locked to `REQUESTED`, voice entry no longer creates completed work or income, the UI uses server-authoritative lifecycle transitions, and seeded jobs belong to the authenticated demo user. The seed is idempotent and has a read-only ownership checker. Run 11 corrected Kamai arithmetic and periods, added offline-capable typed payment entry, and made passport headline counts derive from completed jobs and reviews. Remaining serious weaknesses: quote download is text only; passport download is an alert; the API-enabled client bundle triggers the existing size warning. Production Gemini inference, production rate DB parity, UptimeRobot, and the complete physical two-phone flow need verification.

The active branch is `codex/sih-mvp`. The user requires work only there, no commit without explicit permission, and no push to `upstream`. `origin` is the fork and `upstream` is canonical. Before significant work, fetch upstream and compare; if upstream changed, report commits and overlap and wait for approval. Preserve the uncommitted Run 9 cleanup unless the user says otherwise.

Immediate task: Run 11, the deployed two-phone rehearsal defined in Section 12. Do not publish, deploy, rotate services, or write shared/production data without the required explicit authorization.

Run lint, build, tree check, regression tests, rate checks, and a two-phone deployed rehearsal before declaring the prototype ready. Never infer implementation from the PDF or old audit documents; read the current code and label unknown external state as **Needs verification**.
