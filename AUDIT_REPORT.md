# Kaarigar — Prototype Audit Report

**Audit date:** 27 August 2026
**Subject:** AI Studio prototype at `E:\Coding 2026\Kaarigar`, commit `e7f62a7`
**Reference:** `Kaarigar_Architecture_v1.pdf` (System & Feature Architecture v1.0, 27 August 2026)
**Scope:** Read-only analysis. No application code was modified.

---

## Headline

**The prototype is a UI shell.** It has five well-built screens, a working voice interaction layer, and one working server-side AI proxy. Underneath them there is no identity, no database, no authorization, no offline layer, and no implementation of four of the eight modules the architecture marks MVP. Data lives in `localStorage` and dies with the browser profile.

Two findings that were **better** than expected, and both change the plan:

1. **No credential has ever been committed to this repository.** Verified across all blobs in all commits. Nothing needs revoking.
2. **The Gemini API key is already server-side**, behind an Express proxy, and never reaches the browser. The AI Studio template got this right.

Roughly **91% of the existing 4,150 lines survive** the migration to a real system (Phase 5). The problem is not that the wrong code was written; it is that the system beneath the screens was never started.

---

# Phase 1 — Ground Truth Inventory

Every item was confirmed by opening the file, not inferred from directory names.

## 1.1 Stack

| Item | Value | Evidence |
|---|---|---|
| Framework | React 19 SPA (`react@19.0.1`), no meta-framework | `package.json:22-23` |
| Build tool | Vite 6 (`^6.2.3`); Tailwind v4 via `@tailwindcss/vite` | `package.json:24`, `vite.config.ts:8` |
| Language | TypeScript `~5.8.2`, `noEmit: true`, `jsx: react-jsx` | `tsconfig.json` |
| Package manager | **Bun** — `bun.lock` is the only lockfile | `bun.lock:1-3` |
| Server runtime | Express 4 (resolved `express@4.22.2`), `tsx` in dev, `esbuild` bundle to `dist/server.cjs` for prod | `package.json:7-9` |
| AI SDK | `@google/genai`, requested `^2.4.0`, **resolved 2.19.0** | `package.json:13`, `bun.lock:124` |
| Other | `lucide-react`, `motion` (→ `framer-motion@12.43.0`), `canvas-confetti`, `dotenv` | `package.json:13-25` |
| Installed? | `node_modules` **not present** — nothing has been run in this checkout | — |

`package.json` still reads `"name": "react-example"`; the project was never renamed off the template.

## 1.2 Directory map

```
/                      index.html, vite.config.ts, tsconfig.json, package.json, bun.lock
server.ts              the ONLY backend file (390 lines)
src/
  main.tsx             React root (10)
  App.tsx              root component + ALL app state (228)
  types.ts             all types (91)
  index.css            (8)
  components/          8 files, 2,629 lines
  data/initialData.ts  hardcoded seed (135)
  data/translations.ts i18n, 5 languages (400)
  utils/speech.ts      Web Speech API + WebAudio SFX (259)
assets/.aistudio/      empty, self-ignored
```

Total application source: **~4,150 lines** across 16 files.

There is no `src/services/`, `src/api/`, `src/store/`, `src/hooks/`, `src/lib/`, or `src/routes/`. **No service layer exists.**

## 1.3 Navigation

**Not a router.** No `react-router`, no history API. Navigation is conditional rendering on one string:

- `src/App.tsx:31` — `const [activeTab, setActiveTab] = useState<string>('home')`
- `src/App.tsx:157-202` — five `{activeTab === '...' && <Component/>}` blocks
- `src/components/Navbar.tsx:32-38` — tab ids `home`, `passport`, `jobs`, `kamai`, `profile`

Consequence: no URLs, no deep links, no back button, and no route can exist for the public passport page the architecture requires.

## 1.4 State management

All state is `useState` in `App.tsx`, passed by props. No Context, no store, no query library.

| State | Line |
|---|---|
| `activeTab` | `App.tsx:31` |
| `currentLanguage` | `App.tsx:34` |
| `profile` | `App.tsx:45` |
| `jobs` | `App.tsx:60` |
| `kamaiList` | `App.tsx:75` |
| modal flags | `App.tsx:90-93` |

`VoiceAssistantModal` holds 17 further `useState`/`useEffect` calls of local draft state that shadow the parent until confirmed.

## 1.5 Data sources today

1. **Hardcoded seed arrays** — `src/data/initialData.ts`: `INITIAL_PROFILE` (Ramesh Kumar, 248 jobs, ₹3,84,500 lifetime, `verifiedStatus: 'verified'` at `:24`), `INITIAL_JOBS` (4), `INITIAL_KAMAI` (5). Dates hardcoded to `2026-08-27`/`08-26`/`08-25`.
2. **localStorage** — read as lazy initialisers at `App.tsx:36-87` (`kaarigar_lang`, `kaarigar_profile`, `kaarigar_jobs`, `kaarigar_kamai`), written by four `useEffect`s at `App.tsx:96-110`. **localStorage is the system of record.**
3. **One live API call** — see 1.6.

No mock JSON, no MSW, no fixtures beyond `initialData.ts`.

## 1.6 Gemini usage

**Every Gemini call is server-side. One call site. Not in the browser.**

- Import: `server.ts:4`
- Client construction: `server.ts:10-22`, key from `process.env.GEMINI_API_KEY` via `dotenv.config()` at `server.ts:7`
- The call: `server.ts:106-114`, `ai.models.generateContent(...)` inside `POST /api/assistant/process`, model `gemini-3.7-flash`
- Purpose: extract structured data (trade, experience, skills, job, kamai) from a voice transcript and return JSON plus a spoken reply

Confirmed by grep: **zero** occurrences of `genai`, `GoogleGenAI`, `API_KEY`, `GEMINI`, `import.meta.env`, or `process.env` under `src/` or in `index.html`. `vite.config.ts` has **no `define:` block**. The key is not bundled.

The browser calls only its own origin — `src/components/VoiceAssistantModal.tsx:193`, `fetch('/api/assistant/process', ...)`. That is the only `fetch` in the entire client.

## 1.7 Backend

**Yes, there is a server — one file, two routes, storing nothing.**

- `server.ts`: Express on port 3000, `express.json()`, Vite middleware in dev (`:371-376`), static `dist/` in prod (`:377-383`)
- Routes: `GET /api/health` (`:30`) and `POST /api/assistant/process` (`:39`). That is the entire API surface.
- No database driver, ORM, or connection string. Nothing posted to the assistant route is stored.
- No auth middleware, sessions, cookies, CORS config, rate limiting, validation, or request logging.
- No `Dockerfile`, no `docker-compose`, no `.github/` CI.

**There is a server, but no backend in the architectural sense** — no data tier, no identity, no authorization, no persistence.

## 1.8 Other facts

- **Tests: none.** No `*.test.*`, `*.spec.*`, no vitest/jest/playwright config, no `test` script.
- Only `.env.example` exists on disk. `.gitignore:7-8` is `.env*` then `!.env.example` — correct.
- Remote `https://github.com/deepindersinghbti/Kaarigar.git`, single commit `e7f62a7`, branch `main`.
- `HomeDashboard`, `Navbar`, `LanguageSelectorModal` have **zero** hooks — pure presentational.
- Demo scaffolding sits inside production screens: `HomeDashboard.tsx:341-364` ("Hackathon Demo Showcase"), `VoiceAssistantModal.tsx:750-830`.
- "Download ID" is `alert('Digital Passport ID Card downloaded as PDF!')` — `DigitalPassport.tsx:256`. The QR is a static Lucide `<QrCode/>` icon — `DigitalPassport.tsx:230`, comment reads "Real Visual QR Code simulation".

---

# Phase 2 — What the Architecture Specifies

## Authentication and roles

Phone number as primary key, OTP-verified. **No passwords** — §6 states they are a barrier for this user group. On verify: device binding, **JWT access token (15 min) + rotating refresh token**, refresh-reuse detection revoking the token family. Optional Aadhaar via DigiLocker or offline eKYC XML; store verification token, name-match result, masked last-four only — raw number never written to disk or logs.

Five roles with defined scopes (§3): **Kaarigar** (full read/write own passport, ledger, jobs; read-only rate bands; no access to other workers' data) · **Customer** (read public passports; write reviews only for jobs they booked) · **Contractor** (crew availability with consent, crew assignments) · **Verifier** (attestations only, revocable; *"no ledger access, ever"*) · **Institution/Admin & Platform Ops** (aggregated anonymised analytics only; scoped, audit-logged break-glass).

§12.1: role checks enforced **"at the service layer, never only in the UI"**, with object-level checks on every ledger and passport read.

## Data model and database

**MongoDB 7 replica set** primary, 2dsphere geo indexes, multi-document transactions on ledger writes. **Redis 7** for OTP store, hot rate bands, rate limiting, Celery queue. **MinIO (dev) / S3 (prod)** for media and PDFs via presigned URLs.

Fifteen collections (§7): `users`, `kaarigar_profiles`, `credentials`, `portfolio_items`, `jobs`, `quotes`, `ledger_entries`, `receivables`, `reviews`, `rate_bands`, `price_observations`, `consents`, `disputes`, `audit_log`.

Two rules that matter more than the field lists:

- **Client-generated UUIDv7 IDs** so offline-created records have a permanent sortable identity from creation.
- **Append-only ledger.** Corrections are reversing entries with a reason code, never in-place edits. Gives an audit trail, makes the export credible to a lender, and eliminates most sync conflicts by construction.

§17 leaves open: **MongoDB for the ledger vs. a separate PostgreSQL.** The doc's own read — Mongo with transactions is sufficient and keeps the stack single; Postgres is stronger if a judge presses on financial integrity.

## API / service layer

A **FastAPI (Python 3.11) modular monolith** with nine pre-drawn boundaries: `identity-svc`, `passport-svc`, `ledger-svc`, `pricing-svc`, `jobs-svc`, `reputation-svc`, `discovery-svc`, `notify-svc`, `sync-svc`. Separate routers, separate data-access modules, **no cross-module direct DB reads**. §5.2 argues a modular monolith is correct for a team of four and that microservices now would trade real delivery speed for imaginary scale.

Edge tier: Nginx/Traefik gateway, auth middleware (JWT verify + device binding + RBAC), Redis token-bucket rate limiter with OTP abuse guard. Celery workers for media, OCR, score recompute, notifications, fraud scan, PDFs.

~17 endpoints (§8), including `/auth/otp/request`, `/auth/otp/verify`, `/passport/me`, `/p/{handle}`, `/ledger/entries`, `/ledger/entries/{id}/reverse`, `/pricing/band`, `/quotes`, `/jobs/{id}/transition`, `/discovery/search`, `/reviews`, `/sync/batch`, `/consents`.

## Offline-first and sync

§9 calls this **"the single most important engineering decision in the product."** The user works in basements, stairwells, construction sites, and villages on intermittent 2G; an app that needs connectivity to log a payment "will be abandoned within a week."

Principles: device is source of truth for creation; every write commits locally and enters an **outbox**; UI never blocks on network or spins for a local action; client UUIDv7 IDs; `/sync/batch` idempotent and replay-safe, deduplicating on client UUID; append-only ledger makes merges a union; last-write-wins on mutable docs with the losing version kept in a shadow field; media deferred to strong connections; and **visible sync state** per record, because "hidden sync erodes trust in a financial record."

Sync flushes the outbox **in causal order** (jobs → ledger entries → reviews) in batches of 50, per-item accept/reject with reasons, then a watermark delta pull. On-device DB: **WatermelonDB (SQLite)**. Target: **7 days full offline functionality**.

## Security and privacy

TLS 1.3, encryption at rest, **field-level encryption for contact details and eKYC artifacts**. Presigned short-lived media URLs, private buckets, per-item worker-controlled visibility. Append-only audit log for every cross-user access, consent event, and break-glass action. Secrets environment-injected, never committed, documented rotation for the VC signing key.

DPDP Act 2023 (§12.2): purpose limitation via consent artifacts; data minimisation — **no caste, religion, or income-source profiling**, locality granularity except on an active job; granular time-bound one-tap revocable consent; full export as signed JSON + PDF without support intervention; erasure of PII and media; **pictorial vernacular consent screens**, because a dense English privacy policy "is not meaningful notice for this user group."

§11 constrains the trust score: published rubric not a learned model, new-worker neutral floor, rate-limited decline, appeal path, no protected-attribute proxies.

## Deployment topology

Six tiers. **Clients:** React Native (Expo) worker app, same codebase role-scoped for customer, **Next.js SSR public passport page** (no install), Next.js admin console, WhatsApp Business Cloud API bot. **Edge:** Nginx/Traefik + auth middleware + Redis limiter. **App:** FastAPI monolith. **Async:** Celery/Redis. **Data:** MongoDB + Redis + MinIO/S3 + analytics store + audit log. **External:** DigiLocker, Aadhaar eKYC, e-Shram, maps, UPI, government rate schedules.

Deploy via **Docker Compose to a single VPS**, K8s-ready manifests for later. GitHub Actions on merge to main. Prometheus + Grafana + Sentry.

NFRs (§13): p95 API latency < 300 ms, APK < 25 MB, Android 8 / 2 GB RAM floor, cold start < 2.5 s, 99.5% availability, 48dp targets, 4.5:1 contrast.

## Two findings from §4 Module H and §14.1

**(a) The architecture explicitly dropped voice-first.** Module H lists text-to-speech readout as **Later**, "as an accessibility helper only," and states the earlier voice-first framing was dropped and should stay out of the MVP because it multiplies build risk. The prototype is entirely voice-first: `VoiceAssistantModal.tsx` is 908 lines — 22% of the codebase — and the only write path for onboarding, jobs, and earnings (`App.tsx:206-217`).

> **Resolved by team decision — voice is reinstated as a first-class MVP input. See Amendment 2 in `MIGRATION_PLAN.md`.** The build-risk argument no longer applies because the 908 lines already exist and work.

**(b) The demo loop is the real target.** §14.1 specifies the loop to build end to end: onboard → import certificate → customer searches nearby → itemised quote against the fair-price band → job accepted → completed with before/after photos → payment logged → job-anchored review → trust score updates live → **QR passport scanned on a second phone** → 6-month income statement PDF → **pull the network cable, repeat the ledger entry offline, reconnect, show it sync**. Of those twelve beats, the prototype implements a recognisable version of **two**, and neither survives a page refresh on a different device.

---

# Phase 3 — Gap Analysis

The full table is reproduced standalone in `GAP_MATRIX.md`. Summary of verdicts:

| Verdict | Count | Concerns |
|---|---|---|
| PRESENT | 1 | Secrets handling |
| MOCKED | 0 | — |
| MISSING | 6 | Authentication · Authorization/roles · API layer · Offline capability · File/media handling · Testing · **QR passport verification** |
| BLOCKS PRODUCTION | 7 | Data persistence · Data model fidelity · Validation · Error handling · Deployability · Dependency integrity · Date-pinned seed data |

### The three findings that matter most

**1. QR passport verification is MISSING and is the highest priority.** `DigitalPassport.tsx:47-50` shares `https://kaarigar.app/passport/${profile.id}` — a URL with no corresponding route in this codebase, on a domain the repo never serves. Anyone who scans or opens it gets nothing. The QR itself is a static Lucide icon at `DigitalPassport.tsx:230` (source comment: "Real Visual QR Code simulation"). "Download ID" is an `alert()` at `:256`. Passport data lives in one browser's localStorage and is unreachable from a second device by design.

This matters more than any other gap because §1 names portable, QR-verifiable identity as *the* strategic difference from Urban Company and JustDial, and §14.1 puts "the QR passport is scanned on a second phone" in the demo loop. The project's core differentiator is currently an icon and a dead link.

**2. Error handling fails silently in two places, and they compound.** `server.ts:121-123` catches every Gemini failure with `console.warn` only, then falls through to `fallbackProcessVoiceInput` — the 237-line hardcoded keyword matcher at `server.ts:131-367`. The client receives a 200 and cannot distinguish real extraction from the fallback. A quota exhaustion, an auth failure, or a malformed-JSON parse error at `server.ts:117` all look identical to success. Meanwhile `VoiceAssistantModal.tsx:246-248` catches fetch failure with `console.error` and no state change — the spinner stops and nothing else happens. There is no `response.ok` check before `response.json()` at `:207`, so a 500 throws a parse error into that same silent catch. There is no error state, retry, or toast anywhere in `src/`.

Compounding: no `.env` exists in the working tree, so `getGenAI()` returns `null` at `server.ts:11` and **every request currently takes the fallback path**. The warn-only handler is exactly why nobody noticed.

**3. The dashboard silently misreports on every date except 27 August 2026.** Seed records are pinned to `2026-08-27`/`08-26`/`08-25` (`initialData.ts:41,55,69,83,93-125`) while the "today" views compare against a live `new Date()` — `HomeDashboard.tsx:52-53`, `HomeDashboard.tsx:257`, `KamaiView.tsx:35-36`. On any other date, "Today's Kamai" reads ₹0 and "काम आज पूरे" reads 0 while the ledger below shows full history. **Live-demo risk: if the finals are not on 27 August, your headline dashboard number is zero on stage** unless someone runs the voice flow first.

### Data model fidelity — concrete mismatches

Three interfaces (`src/types.ts`) against fifteen required collections (§7).

| Required | Prototype | Mismatch |
|---|---|---|
| `users` — `phone`, `role[]`, `languages`, `device_ids[]`, `status` | — | Absent. No user object separate from profile. |
| `kaarigar_profiles` — `trades[{nco_code,...}]`, `service_area{geo, radius_km}`, `availability_today`, `trust_score{value, components{}}`, `passport_handle` | `WorkerProfile` (`types.ts:11-30`) | `trade` is free text, not **NCO-2015/NSQF-coded** — breaks the government-interoperability claim in §4A. `location` is a display string, not GeoJSON — **no 2dsphere index possible, so discovery cannot be built on it**. No `availability_today`. `rating: number` is a flat 4.9 where the doc requires a four-axis Bayesian-adjusted score with visible components. No `passport_handle`. `verifiedStatus` is self-assigned — `VoiceAssistantModal` sets `'verified'` on the user's own say-so at the end of onboarding, with no verifier involved. |
| `credentials` — `issuer`, `issued_on`, `source`, `verification_status`, `evidence_url`, `vc_jwt` | `certifications: string[]` (`types.ts:19`) | Bare strings. No issuer, date, verification status, evidence, or signed VC. "ITI Electrician Certified" is typed by the fallback matcher at `server.ts:180` and rendered as verified. |
| `portfolio_items` — `media[{url, phash, geo, captured_at}]`, `visibility` | — | Absent. No media anywhere. |
| `jobs` — `state`, `state_history[]`, `location{geo}`, `crew[]`, `customer_id` | `JobItem` (`types.ts:32-45`) | `status` has 3 values against the required **8-state machine** (`REQUESTED→QUOTED→ACCEPTED→SCHEDULED→IN_PROGRESS→COMPLETED→SETTLED→REVIEWED` + `CANCELLED`/`DISPUTED`). No `state_history`, so no immutable timestamped transitions. `customerName` is free text, not a `customer_id` — **so job-anchored reviews cannot be built**, there being no customer identity to anchor to. |
| `ledger_entries` — client UUID `_id`, `direction (in/out)`, `category`, `reverses_id?`, `sync_state`, append-only | `KamaiEntry` (`types.ts:47-55`) | IDs are `km-${Date.now()}` (`App.tsx:129`) — **collision-prone, not UUIDv7**. **Income-only**: no `direction`, so material expenses cannot be recorded and net margin is uncomputable — §4B calls gross-only a "gross-receipts illusion." No `reverses_id`, no `sync_state`; array is mutable rather than append-only. |
| `receivables` (udhaar) | — | Absent. §15.2 identifies this as **the retention hook**. |
| `quotes`, `rate_bands`, `price_observations` | — | Absent. The entire Mol-Bhav Fair Price Engine, an MVP module. |
| `reviews` | — | Absent. Reputation & Discovery, also MVP. |
| `consents`, `disputes`, `audit_log` | — | Absent. These are DPDP compliance surfaces, not optional features. |

Four of the eight MVP modules (Mol-Bhav pricing, Reputation & Discovery, most of Job Management, the udhaar half of Kamai) have zero implementation.

---

# Phase 4 — Security Audit

**No credential has ever been committed to this repository. Nothing needs revoking.**

Stated up front and unqualified, because the AI Studio template family this came from often does leak keys — this one does not.

**1. Env files.** One exists on disk and in history: `.env.example`. Two keys, both placeholders:

| Key | Value present? | Value |
|---|---|---|
| `GEMINI_API_KEY` | placeholder only | `"MY_GEMINI_API_KEY"` |
| `APP_URL` | placeholder only | `"MY_APP_URL"` |

No `.env` or `.env.local` in the working tree — which also means the app currently runs with no Gemini key at all.

**2. `.gitignore` is correct.** `.gitignore:7-8` is `.env*` then `!.env.example`. Verified with `git check-ignore -v`: `.env` and `.env.local` are both ignored by rule `.gitignore:7`; `.env.example` is correctly un-ignored.

**3. History scan is clean.** `git log --all --full-history -- "*.env*"` returns one commit (`e7f62a7`) touching one path (`.env.example`). Every blob in every commit was then scanned via `git rev-list --all` piped through `git grep -InE` for `AIza`, `sk-`, `mongodb+srv://`, `BEGIN RSA/PRIVATE KEY`, and `xox[baprs]-`. **Zero matches.** Single commit, 25 tracked files; nothing was committed and later removed.

**4. What would leak once deployed publicly** — not credentials, but data and cost:

- **`POST /api/assistant/process` is unauthenticated, unvalidated, and unthrottled** (`server.ts:39-47`). Anyone who finds the deployed URL can post arbitrary text and bill your Gemini quota indefinitely. No rate limiter, no auth, no size cap, no CORS restriction. §5 Tier 2 requires a Redis token bucket; there is nothing.
- **Prompt injection into an unbounded prompt.** `userInput` is interpolated raw at `server.ts:74`. `response.text` is `JSON.parse`d without schema validation at `server.ts:117` and returned wholesale at `:118`, then written into app state at `VoiceAssistantModal.tsx:209-226`. Model output is being treated as trusted data.
- **The passport share link is a future data-exposure problem.** When `/p/{handle}` is built, §8 requires it expose "only fields the worker marked public." There is currently no `visibility` field on anything, so a naive implementation publishes the worker's phone, customer names, customer phone numbers, and full earnings history.
- **PII already in the repo.** `initialData.ts` contains five full names with plausible Indian mobile numbers (`:36`, `:50`, `:64`, `:78`) and street-level locations, committed to a public GitHub repo. Presumed invented — **confirm this**. If any belong to a real person interviewed during research, that is a DPDP problem in a repo judges may read.
- **No transport or storage protections exist** because there is no storage: no TLS config, no field-level encryption, no audit log, no consent artifacts. Every §12.1 control is unimplemented.

---

# Phase 5 — Salvage Assessment

Recalculated after the two architecture amendments recorded in `MIGRATION_PLAN.md` (Express retained; voice reinstated). Buckets 1–3 cover the **4,150 lines that exist**; bucket 4 has no lines at all.

## Bucket 1 — Keep as-is · 666 lines · **16%**

Pure presentation, no data assumptions, ports unchanged.

| File | Lines | Note |
|---|---|---|
| `src/data/translations.ts` | 400 | 5 languages already; architecture needs 2 at MVP, 12 at V1 — **ahead of requirement** |
| `src/components/Navbar.tsx` | 133 | Zero hooks; tab ids become route paths, markup untouched |
| `src/components/LanguageSelectorModal.tsx` | 115 | Zero hooks, fully self-contained |
| `src/index.css` | 8 | |
| `src/main.tsx` | 10 | |

## Bucket 2 — Keep but rewire / extend · 3,121 lines · **75%**

Visually or functionally finished; the change is at the top of each file, not through the markup.

| File | Lines | Rewire needed |
|---|---|---|
| `src/components/VoiceAssistantModal.tsx` | 908 | **Moved from Replace by Amendment 2.** `handleConfirm` posts to real endpoints instead of parent callbacks. Markup and interaction design untouched. |
| `server.ts` | 390 | **Moved from Replace by Amendment 1.** Split into a bootstrap plus router modules on the §5 boundaries; the existing assistant route becomes one module. |
| `src/components/HomeDashboard.tsx` | 370 | Props → API/local queries; fix date-literal filters at `:52-53` and `:257`; strip demo bar at `:341-364` |
| `src/components/DigitalPassport.tsx` | 312 | Real QR replacing icon at `:230`; real share URL at `:49`; real PDF replacing alert at `:256`. **The card design is the single most reusable asset in the repo — it is exactly what the SSR public page must render.** |
| `src/components/JobsView.tsx` | 267 | Data source; 3-status model renders 8 states — additive, existing badge styling preserved |
| `src/components/KamaiView.tsx` | 262 | Data source; add `direction` and a receivables tab alongside existing tabs |
| `src/components/ProfileView.tsx` | 262 | `onSaveProfile` → API call; add validation; trade field becomes an NCO-coded picker in the same input slot |
| `src/utils/speech.ts` | 259 | **Moved with the modal.** `VoiceAssistantModal.tsx:31-37` imports `VoiceRecognizer`, `speakText`, `stopSpeaking`, `sfx`, `isSpeechRecognitionSupported` from it — reinstating voice necessarily reinstates this file. *(This extension of Amendment 2 is inferred from the import graph, not stated in the amendment.)* |
| `src/types.ts` | 91 | Extended to cover the new collections on Day 1, then **frozen as the API contract** so tracks A and B work independently |

## Bucket 3 — Replace · 363 lines · **9%**

Infrastructure stand-ins. Nothing here is visual.

| File | Lines | Why |
|---|---|---|
| `src/App.tsx` | 228 | State container + fake navigation; becomes router + auth provider + data hooks |
| `src/data/initialData.ts` | 135 | Mock seed; also carries the date-pinning defect and the PII |

## Bucket 4 — Build from nothing · 0 existing lines

Against the **locked 10-day scope**: Firebase phone OTP + `users` collection + server-side RBAC middleware · MongoDB Atlas schemas and data access · react-router · `GET /p/{handle}` SSR passport with real QR · `GET /r/{token}` signed single-use review link · tap-entry job/earnings form · localStorage outbox with sync badges · `POST /sync/batch` · statically seeded `rate_bands` + lookup · simple trust-score rubric · income statement PDF.

Against the **full architecture**, additionally: W3C verifiable credentials · media capture and S3 pipeline · DigiLocker/e-Shram/UPI · consent artifacts · audit log · disputes · geo discovery · Celery workers · OCR · admin console · customer app · WhatsApp channel · CI and observability · the test suite.

## The honest summary — with the figure properly qualified

**91% of the existing code survives** (buckets 1 + 2). That is a genuinely good position and worth stating to the team: nobody wasted their time, and the visual design work — the part hardest to redo under time pressure — is done.

The earlier characterisation that this represents "15–20% of the system" needs qualifying, because it measures against the **full production architecture including Later and V1 scope** — DigiLocker, WhatsApp, crew mode, skilling, admin console, the customer app, the ML pricing model. Against that, 15–20% is right but not decision-useful.

**Against the §14.1 demo scope**, which is what the finals are judged on, the gap is far smaller. Estimating: the existing code covers roughly **40–45%** of what must exist by Day 10, and the amendments (keeping Express, keeping voice) removed the two largest rewrite items from the critical path. *This is an estimate from module counting and day-plan sizing, not a measurement — treat it as directional.*

What remains true regardless of the percentage: **this is not an application that needs a backend attached; it is a set of screens that needs a system built beneath them.** Ten days, three people, and the scope cuts in `MIGRATION_PLAN.md` are what make that feasible.
