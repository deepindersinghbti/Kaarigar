# Kaarigar — Migration Plan

**Constraint:** 10 days, 3 developers, SIH 2026 finals.
**Companion documents:** `AUDIT_REPORT.md` (Phases 1–5), `GAP_MATRIX.md` (Phase 3 table).

---

# Part 1 — Architecture Amendments

Two decisions in this plan depart from `Kaarigar_Architecture_v1.pdf` v1.0. Both are deliberate, both are recorded here so the deck, the repo, and the answer given to a judge stay consistent.

## Amendment 1 — Backend stays Express/TypeScript. No FastAPI port.

**What the doc says (§5, §6):** a FastAPI (Python 3.11) modular monolith with nine pre-drawn service boundaries.

**What we are doing:** keeping the existing Express/TypeScript server and implementing the same nine boundaries as router and data-access modules inside it.

**Why.** A rewrite buys zero functional capability. It adds a second runtime and a second dependency toolchain to a three-person team with ten days, and it discards a server that already works, already proxies Gemini correctly, and already has its dev/prod build wired (`package.json:7-9`). §5.2's own argument — that pre-drawn boundaries preserve the option to split later, and that choosing the more distributed thing now "would trade real delivery speed for imaginary scale" — applies with equal force to its own language choice. The boundary discipline is what matters and we are keeping it: separate routers, separate data-access modules, no cross-module direct database reads.

**Consequence for the salvage buckets:** `server.ts` (390 lines) moves from *Replace* to *Keep-and-extend*.

**If a judge asks:** the service boundaries in §5 are honoured exactly; only the runtime differs, and the runtime was chosen to avoid a rewrite that would have consumed roughly a fifth of the available schedule. *(Estimate: 2 days of the 10, based on porting nine route modules plus re-establishing the Gemini integration and build pipeline.)*

## Amendment 2 — Voice is reinstated as a first-class MVP input.

**What the doc says (§4, Module H):** text-to-speech readout is **Later**, "an accessibility helper only," and the earlier voice-first framing "was dropped and should stay out of the MVP, as it multiplies build risk for a demo."

**What we are doing:** keeping voice as a primary input path alongside a new tap-entry form.

**Why.** The build-risk argument was written before the code existed. `VoiceAssistantModal.tsx` is 908 working lines and `speech.ts` is 259 more; the risk the doc was guarding against has already been paid down. Cutting it would *remove* working functionality and cost additional days.

**Consequences for the salvage buckets:** `VoiceAssistantModal.tsx` (908) moves from *Replace* to *Keep-and-extend*. `speech.ts` (259) moves with it — `VoiceAssistantModal.tsx:31-37` imports `VoiceRecognizer`, `speakText`, `stopSpeaking`, `sfx`, and `isSpeechRecognitionSupported` from it, so reinstating one necessarily reinstates the other. *(This second move is inferred from the import graph; it was not stated in the amendment as given.)*

**What we are still building anyway:** the tap-entry form from §4B. Voice cannot be the *only* write path, because the offline demo beat requires a write that works with no network, and speech recognition in this app round-trips to the server. Voice becomes the fast path; tap becomes the reliable path. This is the reading that satisfies both the doc's caution and the team's decision.

## Amendment 3 (implicit in the locked scope) — localStorage outbox instead of WatermelonDB.

The doc specifies WatermelonDB (SQLite) with causal-order sync (§9). We are building a minimal outbox on the existing localStorage layer: queue mutations that fail or are attempted offline, flush on reconnect, render per-record pending/synced/failed state.

*Estimated 1–2 days instead of ~5, and functionally indistinguishable on stage.* The **append-only ledger design is retained in full**, which is what makes this safe: because entries are immutable and identified by client-generated UUID, the V1 migration to WatermelonDB is a mechanical swap of the storage adapter, not a redesign of the sync semantics. The conflict model does not change, because with an append-only log there is barely a conflict model to change.

---

# Part 2 — Options Considered

Recorded briefly because the choice should be defensible, not because the outcome was ever in doubt once the timeline was fixed at ten days.

### Option A — Wrap the existing frontend with a real backend and swap the data layer *(chosen)*

Keep Vite + React 19 + Express. Add MongoDB Atlas, Firebase phone auth, react-router, and server-rendered public routes off the same Express app.

- **Auth:** Firebase phone OTP on the client; Firebase Admin SDK verifies the ID token in Express middleware; `req.user` carries uid + role; RBAC enforced per route.
- **Database:** MongoDB Atlas (managed, free/shared tier), reached only from the server.
- **Secrets:** unchanged — already server-side and correct (`server.ts:11-13`). Mongo URI and Firebase service account join `GEMINI_API_KEY` in the same server-only environment.
- **Deployment:** one Node container, already buildable (`package.json:8-9`). Render/Railway/Fly, or a single VPS with Docker Compose per §6.
- **Preserves:** all 4,150 lines minus `App.tsx` and `initialData.ts` — 91%.
- **Cost:** diverges from the doc's stated runtime (Amendment 1) and its client topology (single web app rather than React Native + separate Next.js surfaces).

### Option B — Move the frontend into Next.js

Port the components into a Next.js App Router project; get SSR for the public passport page and server actions for data access natively.

- **Preserves:** the components, but every one needs client/server-boundary annotation and the routing model changes.
- **Cost estimate: 2–3 days of pure migration** before a single feature is built, and it puts the whole team in a framework they would be learning under deadline. It buys a better public-passport story than Express SSR, which Express can approximate adequately for one page.
- **Verdict:** the right answer at V1, the wrong answer with ten days.

### Option C — Treat the prototype as a design reference and rebuild against the doc

React Native + FastAPI + MongoDB, porting the visual design across.

- **Preserves:** the design, as reference only. Nothing runs on day one.
- **Cost:** not deliverable in ten days by three people. Not a close call.
- **Verdict:** rejected.

**Option A is chosen** because it is the only one where the app is runnable on every single day of the schedule, which is the constraint that actually governs a hackathon build.

---

# Part 3 — Locked Scope

### Building properly (non-negotiable)
Firebase phone OTP + `users` collection + server-side RBAC · MongoDB Atlas as system of record · react-router · `GET /p/:handle` SSR public passport with real QR · `GET /r/:token` signed single-use job-bound review link · tap-entry job/earnings form · income statement PDF.

### Building cheap
**Fair-price engine:** `rate_bands` as a statically seeded collection (~30 task rates from CPWD/state schedules), a lookup endpoint, and a band display. No ML, no observation feedback loop. **Trust score:** simple computed rubric, no fairness machinery. **Receivables:** a `direction` field plus a tab, only if there is slack.

### Cut — roadmap slide only
Media/photo upload and portfolio capture · DigiLocker · e-Shram · UPI · W3C verifiable credentials · consent artifacts · audit log · admin console · Celery/async workers · OCR · geo/2dsphere discovery search · skilling module · crew mode · WatermelonDB and causal-order sync.

### Agreed cut order if the schedule slips
Drop one at a time, in this order: **(1) fair-price engine · (2) receivables · (3) PDF export.**

**These three are deliberately scheduled last and downstream of nothing.** Fair price lands Day 7, receivables Day 8, PDF Day 5 but isolated in Track C with no consumer. No task after them depends on them; dropping any one removes a screen element and nothing else. **Never touch QR passport, auth, or persistence** — those three are what distinguish a built system from a mockup.

---

# Part 4 — Team Split

| Track | Owns | Never touches |
|---|---|---|
| **A — data/backend** | `src/server/db.ts`, `src/server/routes/{identity,passport,jobs,ledger,pricing,sync}.ts`, middleware, Mongo schemas, seed scripts | `src/components/*`, `App.tsx` |
| **B — app rewire** | `App.tsx` **exclusively**, `src/components/*`, router, outbox, tap-entry form | `src/server/*` |
| **C — public surfaces** | `src/server/routes/{public,reputation}.ts`, SSR templates, QR generation, PDF export, review flow | `App.tsx` |

**The single most important collision rule: B owns `App.tsx` alone.** It is the file every track would otherwise want to touch, and it is the one file that breaks the whole app when merged badly.

**The second: `server.ts` is split into route modules on Day 1, before A and C both need it.** Without that split they collide on one 390-line file for ten days.

---

# Part 5 — The Day-by-Day Plan

Reading the demo-loop column: these are the §14.1 beats **working end to end by that evening**, with two documented substitutions — customer discovery is replaced by the customer opening the QR passport (geo search is cut), and before/after photos are cut.

---

## Day 0 — Prerequisites

**These are external dependencies with lead time. None of them is a coding task, and that is exactly why they get missed** — no line of code declares them, so they surface as an unexplained failure on the day something depends on them. Every item here blocks a specific later day, named in the right-hand column and cross-referenced in Part 6.

Do these before Day 1 begins, or first thing on Day 1 morning in parallel with the `types.ts` session. They are cheap when done early and expensive when discovered late.

| # | Prerequisite | Owner | Blocks | Failure mode if skipped |
|---|---|---|---|---|
| P1 | **Gemini API key obtained and placed in a real `.env`** | A | Day 1 voice verification; all of Amendment 2 | Silent — see below |
| P2 | **MongoDB Atlas cluster created and IP allowlist configured** | A | Day 3's first authenticated API call | Connection timeout that reads as a code bug |
| P3 | **Secrets distribution channel agreed** | All | B and C being able to run the server at all, from Day 2 | Two of three developers cannot start the app |
| P4 | **Firebase project created with billing enabled** | A | Day 2 OTP go/no-go | The go/no-go cannot be run, so the decision slips |
| P5 | **Two phones with cameras + one working Indian SIM** | All | Day 2 OTP test, Day 6 QR scan, Day 10 rehearsal, the stage demo | Three separate days cannot be verified |

### P1 — Gemini key verification *(Day 1 Track A task, not just a prerequisite)*

The audit found that **no `.env` exists in the working tree**, so `getGenAI()` returns `null` at `server.ts:11` and every request currently falls through to `fallbackProcessVoiceInput` — the 237-line keyword matcher at `server.ts:131-367`. **The real Gemini path has never executed in this repository.**

That was tolerable when voice was slated for removal. Amendment 2 reinstates voice as a first-class MVP input, which makes an unverified AI path a load-bearing unknown sitting under the demo's most distinctive moment.

**Day 1 Track A task:** put a real key in `.env`, then `curl` `/api/assistant/process` repeatedly until the response is **confirmed to originate from Gemini and not from the fallback**.

**This requires moving the `source: 'fallback'` field from Day 6 to Day 1.** It was originally scheduled as Day 6 polish; it is in fact the verification mechanism, and without it there is no way to tell the two code paths apart — both return a 200 with a well-formed body, which is precisely why nobody noticed the fallback was carrying the entire demo. Build the discriminator first, then use it to verify.

Budget for the possibility that the Gemini path fails on first contact and needs debugging. Discovering that on Day 1 is a morning; discovering it on Day 5 during the voice rewire is a crisis.

### P2 — Atlas IP allowlist

**Free-tier MongoDB Atlas blocks all inbound IPs by default.** Three developers on dynamic Indian home broadband, plus the deploy host, all need entries. Dynamic IPs change — expect to re-add them mid-week.

The failure mode is what makes this worth naming: an un-allowlisted IP produces a **connection timeout**, not an auth error. On Day 3, when Track B makes the first authenticated API call and it hangs, the natural assumption is that A's new endpoint or B's new auth wiring is broken. The team can lose hours to the wrong file. Decide the policy on Day 1 — per-developer entries, or `0.0.0.0/0` with a strong generated password on a database holding only seed data, retightened before any real pilot.

### P3 — Secrets distribution channel

`.gitignore:7` correctly blocks `.env*`, which is right and stays. The consequence is operational: **A cannot commit `MONGODB_URI`, the Firebase service account JSON, or the review-token HMAC secret, and B and C cannot run the server without them.** From Day 2 onward, two of three developers are blocked on receiving values that cannot travel through the repo.

Agree the channel on Day 1 — a shared password manager, or the deploy platform's own secrets UI plus a direct message for local development. Any choice works; no choice means someone pastes a service account into a group chat on Day 3.

**Standing rule:** `.env.example` is updated with every new key **in the same commit that introduces the key**. It is the only part of the secret configuration that is allowed in the repo, so it is the only signal the other two tracks get that a new variable exists. A key added without it produces a `undefined` at runtime with no indication of what is missing.

**One specific trap.** The `/r/:token` HMAC secret **must be byte-identical across local and deployed environments.** If it is not, review links generated locally fail verification when opened against the deploy and vice versa — and the symptom is an invalid-signature rejection, which reads as a bug in the signing code. Two developers will debug the signature implementation before either checks whether they hold the same secret. Generate it once, distribute it through the agreed channel, and record in `.env.example` that it must match across environments.

### P4 — Firebase billing

**Phone authentication requires a billing account on the Firebase project**, even within free-tier quota. Enabling it involves a payment method and can take longer than expected if that has to be arranged with someone else. This gates the Day 2 go/no-go entirely: without billing, the test cannot be run, so the decision cannot be made, so Day 3's auth work starts on an unresolved question.

Pair this with the Day 2 authorized-domains step: billing enables the capability, authorized domains permits the origin, and **both are needed before a single OTP will send**.

### P5 — Physical devices

**Two phones with working cameras and at least one live Indian SIM.** Needed on three separate days:

- **Day 2** — receiving the actual OTP, which is the whole point of the go/no-go
- **Day 6** — scanning the QR from a *second* device, which cannot be simulated in a desktop browser and is the single beat most likely to impress a panel
- **Day 10 and the stage demo** — the rehearsal is not a rehearsal if it runs on a laptop

Confirm on Day 0 that the devices exist, that the SIM can receive SMS, and that both cameras scan a QR reliably. Also carry this into the Day 10 checklist: **both phones charged, both on the venue network or on mobile data, and the QR scan tested at the venue** — a QR that scans in a lit room can fail on a dim projector screen.

---

## Day 1 — Contract, hygiene, unblocking

**Morning, all three together (~90 min): expand and freeze `types.ts`.**

This is the first task of the whole plan and everything else waits on it. Add `User`, `role`, `passport_handle`, `direction`, `sync_state`, `state_history`, the 8-state job enum, `RateBand`, `Review`, and `TrustScore`. Then it is **frozen** — changes only by agreement of all three, because tracks A, B, and C will each be coding against it independently from Day 2 onward. A contract that moves under two of the three tracks is how parallel work turns into a merge disaster on Day 6.

| Track | Tasks |
|---|---|
| **A** | Provision MongoDB Atlas cluster **and configure the IP allowlist (P2)**; write `src/server/db.ts`. **Split `server.ts` into a bootstrap plus `src/server/routes/*.ts` modules on the §5 boundaries** — the existing assistant route becomes one module, unchanged. **Add the `source: 'fallback'` field at `server.ts:121-123`** (moved forward from Day 6 — it is the discriminator P1 needs), then **verify the Gemini path actually executes**: real key in `.env`, `curl /api/assistant/process`, confirm `source` is *not* `fallback`. **Start the Firebase phone OTP delivery test to a real Indian mobile number immediately (P4 billing must already be enabled)** — this has the longest lead time of anything in the plan. |
| **B** | Install react-router; convert the five `activeTab` conditionals (`App.tsx:157-202`) to real routes; `Navbar.tsx:32-38` tab ids become `NavLink` paths. Data still comes from localStorage. |
| **C** | **In this order.** (1) `server.ts:25` → `process.env.PORT \|\| 3000`. (2) **Bare deploy to Render or Railway** — the app as it stands, nothing added, just to obtain a real public URL. (3) Resolve the lockfile mismatch — pick Bun or npm and make `README.md:14` match. (4) Remove date-pinning: `initialData.ts:41,55,69,83,93-125` become offsets from `new Date()`, and verify `HomeDashboard.tsx:52-53`, `HomeDashboard.tsx:257`, `KamaiView.tsx:35-36` now compute correctly on any date. |

**Why this order.** Nothing here needs anything else, which is exactly why it is Day 1 — three people can work at full speed with zero coordination cost. The two structural moves (freezing types, splitting the server) exist solely to make Days 2–8 parallelisable. The date-pinning fix is Day 1 rather than later because it is currently a live demo hazard: on any date except 27 August the dashboard reads zero.

**Why the deploy is Day 1 and not Day 9.** A deployed URL is a hidden dependency of two later days and it is cheap to satisfy now. Day 2 generates a QR code that must encode a **real, reachable** `/p/:handle` URL — a QR pointing at `localhost` is useless the moment it leaves the developer's machine, and re-cutting it later invalidates anything already printed or screenshotted. Day 6 tests that QR by scanning it from a second phone on a real network, which cannot be done against a local dev server at all. And Firebase phone auth will not accept sign-ins from an origin absent from its authorized-domains list, so the deploy domain has to exist before Day 2's auth work is testable anywhere but locally. The port fix is sequenced first within the day because it is the deploy's own prerequisite — a hardcoded 3000 breaks most PaaS targets.

Day 9's "deploy" therefore becomes a **redeploy** of a target that has been live and exercised since Day 1, which is the far safer shape: the first deploy of a project should never happen the day before a freeze.

**End of day:** app runs locally and at a public URL, has real URLs and a working back button, dashboard is correct on every date.
**Demo loop:** 2 beats (voice job entry, voice earnings entry) — unchanged, but no longer date-fragile.

---

## Day 2 — Auth spine · **OTP go/no-go**

| Track | Tasks |
|---|---|
| **A** | Firebase Admin SDK; `requireAuth` middleware verifying the Firebase ID token and attaching `req.user`; `requireRole(...)` RBAC helper; `users` collection with upsert-on-first-login. |
| **B** | Login screen — **a new screen, built in the existing visual language** (orange/Plus Jakarta Sans; `LanguageSelectorModal.tsx` is the styling reference). `AuthProvider` context and a protected-route wrapper. Behind a flag, so the app still runs unauthenticated all day. |
| **C** | **First: add the Day 1 deploy domain to the Firebase console's authorized-domains list** (Authentication → Settings → Authorized domains), alongside `localhost`. Without this, phone sign-in fails from the deployed origin and Day 2's go/no-go test below cannot be run anywhere real. Then: `GET /p/:handle` returning real server-rendered HTML that reuses `DigitalPassport.tsx`'s markup and Tailwind classes, fed by a **static seed profile JSON**. Real QR generated (`qrcode`) encoding the **deployed** `/p/:handle` URL from Day 1 — not a localhost URL. |

### The decision point — end of Day 2

**Is Firebase phone OTP delivering to a real Indian mobile number?** Billing enablement and DLT/SMS routing are a known failure mode and are outside our control.

- **Yes** → proceed as planned.
- **No** → **fall back immediately** to our own OTP endpoint: `POST /auth/otp/request` generates a code and logs it server-side; `POST /auth/otp/verify` issues a real signed JWT with real session handling. **Identical architecture, stubbed delivery only.** Say so plainly on stage — §14.1 explicitly endorses labelled stubs and warns that claiming an integration you do not have is the fastest way to lose a panel.

Do not spend Day 3 fighting SMS routing. The fallback costs roughly half a day and nothing downstream changes, because `requireAuth` presents the same `req.user` either way. **That interface parity is the entire reason this decision can be deferred to end of Day 2 without stalling anyone.**

**Blocking risk and its unblock:** C needs a profile shape but not A's database — it works from the frozen `types.ts` and a seed JSON. This is deliberate: **Track C has no dependency on Track A until Day 4**, which is what lets the public passport — the highest-priority gap in the audit — start on Day 2 rather than waiting for auth.

**End of day:** app runs; `/p/:handle` serves a real page with a real scannable QR against seed data.
**Demo loop:** 2 beats, plus the QR page rendering (not yet backed by real data).

---

## Day 3 — Passport persistence · auth lands

| Track | Tasks |
|---|---|
| **A** | `GET /passport/me`, `PATCH /passport/me`, `GET /jobs`, `POST /jobs` — authenticated, RBAC-checked, real Mongo. Seed script creating the demo worker. **Ship the `USE_API` feature flag.** |
| **B** | Wire login to real auth; `App.tsx` becomes router + `AuthProvider`; `ProfileView` and `DigitalPassport` read from `/passport/me` **behind the flag**. |
| **C** | `GET /r/:token` — HMAC-signed, job-bound, single-use (redemption recorded in Mongo). Review submission page in the app's visual language. `reviews` schema. |

**Why the feature flag is a Day 3 deliverable and not a Day 6 rescue.** B has to migrate seven screens from localStorage to the API. If that is one atomic switch, the app is broken for however long the migration takes, which violates the runnable-every-day rule and destroys the ability to demo mid-week. With `USE_API` per-screen, B migrates one component at a time and any screen can be reverted in seconds. **This flag is also the contingency for Day 6, the highest-risk day — which is why it must exist three days before it is needed.**

**End of day:** login works; passport and profile are backed by MongoDB.
**Demo loop:** 3 beats — worker onboards *for real* (survives refresh, survives a different device), plus the QR page.

---

## Day 4 — Ledger · tap entry

| Track | Tasks |
|---|---|
| **A** | `POST /ledger/entries` — **idempotent on client-generated UUID, append-only, with `direction`**. `GET /ledger/summary`. `POST /ledger/entries/:id/reverse`. |
| **B** | **Tap-entry job/earnings form** — the §4B under-15-seconds, one-handed, sunlight-readable form. Second new screen, existing visual language. Writes via API. |
| **C** | `POST /reviews`, guarded by the `/r/:token` signature and rejecting unless the job is `COMPLETED`. Review writes back to the profile. `trust_score` field populated. |

**Why the ledger comes before the outbox.** The outbox (Day 6) queues mutations; it needs real mutations that can actually fail. Building the queue before the thing being queued means testing against nothing. And **idempotency has to be designed into `POST /ledger/entries` from its first line** — retrofitting it onto a live endpoint two days later is exactly the kind of change that breaks working screens.

**Why tap entry comes before the voice rewire.** Tap entry is the offline write path (Amendment 2). Getting it working while voice still writes to localStorage means there is always one functioning write path in the app.

**End of day:** earnings and jobs persist to MongoDB via a fast tap form.
**Demo loop:** 5 beats — onboard · job created · job completed · payment logged · review submitted via signed link.

---

## Day 5 — Full rewire · voice to API

| Track | Tasks |
|---|---|
| **A** | `POST /sync/batch` — idempotent ingest, per-item accept/reject with reasons (§9.2 step 5). |
| **B** | `JobsView`, `KamaiView`, `HomeDashboard` read from the API. **`VoiceAssistantModal.handleConfirm` posts to real endpoints** instead of the parent callbacks at `App.tsx:120-142`. |
| **C** | Income statement PDF export, replacing the `alert()` at `DigitalPassport.tsx:256`. |

**Evening: smoke-test the full loop manually**, even though pieces are rough. This is deliberately a day earlier than the formal integration point — finding the interface mismatches on Day 5 leaves Day 6 to fix them, whereas finding them on Day 6 leaves nothing.

**End of day:** every screen reads from MongoDB. Voice and tap both write through the API.
**Demo loop:** 7 beats — the above plus trust score updating and the PDF.

---

## Day 6 — Outbox · sync badges · **integration** ⚠️ **HIGHEST-RISK DAY**

| Track | Tasks |
|---|---|
| **B** | Outbox on localStorage: queue mutations that fail or are attempted offline; flush on reconnect; **per-record pending/synced/failed badges**. **Plus both client-side silent-failure fixes from the audit**: add a `response.ok` check before `response.json()` (`VoiceAssistantModal.tsx:207`) and surface real error state instead of the bare `console.error` at `:246-248`. |
| **A** | Harden sync ingest: per-item accept/reject reasons surfaced properly rather than swallowed. *(The server-side `source: 'fallback'` fix moved to Day 1 — it is P1's verification mechanism, not polish.)* |
| **C** | Test QR scan → second device, on real phones on real networks. Not on localhost. |

**Evening: first full end-to-end demo-loop run, all three tracks integrated.**

**Note on where the silent-failure fixes landed.** The audit found three, in two files, and they have split across two days for two different reasons. The **server-side** one (`server.ts:121-123`) moved to **Day 1**, because it is the discriminator that makes P1's Gemini verification possible — it is a measuring instrument, not a polish item, and a measuring instrument built on Day 6 cannot verify anything on Day 1. The two **client-side** ones (`VoiceAssistantModal.tsx:207` and `:246-248`) stay here and belong to **B**: that file is Track B's, B already has it open for the outbox, and assigning A a change inside `src/components/` would breach the ownership rule in Part 4 — on the highest-risk day, in a file another track is editing. They also pair naturally with the outbox work, since a visible `failed` badge and a real error state are the same feature seen from two angles.

### Why this is the highest-risk day

It is the first time all three tracks' work has to interoperate under one flow, and it is the day the app stops having a local fallback and starts depending on the network plus the outbox. Every integration bug that has been quietly accumulating since Day 2 surfaces within the same eight hours.

**It is riskier than Day 2's OTP question** — which is the other obvious candidate — precisely *because* Day 2 has a pre-planned fallback with interface parity. A known risk with a rehearsed mitigation is a scheduling item. Day 6 is where unknown risk concentrates.

### Contingency

1. **`USE_API` (built Day 3) reverts any misbehaving screen to localStorage in seconds.** The demo can run on a mixed data source; a judge cannot see which screen reads from where.
2. **The outbox is the droppable half of Day 6.** If it is not working by end of day, the sync beat comes out of the demo and the rest of the loop is unaffected — nothing depends on it.
3. **Day 8 is deliberately light** so Day 6 overflow has somewhere to land without touching the freeze.

**End of day:** loop runs end to end, including the offline ledger entry and reconnect.
**Demo loop:** 9 beats — everything except fair-price band and receivables.

---

## Day 7 — Fair price · trust score breakdown

| Track | Tasks |
|---|---|
| **A** | `rate_bands` collection seeded with ~30 task rates from CPWD DSR / state PWD schedules, each carrying `p25`/`p50`/`p75`, `sample_n`, `wage_floor`, `seeded_from`. `GET /pricing/band`. |
| **B** | Band display inside the tap-entry and job forms. |
| **C** | Trust score rubric computation (§11 weights) plus the visible component breakdown on the passport. |

**Two things to get right here, because both are places a sharp judge will push.** Display `sample_n` honestly and suppress the band entirely below a minimum observation count — §4C and §16 both say so explicitly, and "seeded from CPWD DSR, 12 observations" is a far stronger answer than a confident number. And enforce the statutory wage floor **server-side in the pricing module, not as a UI hint** — §4C flags this as a design guard.

**Why fair price is Day 7 and not earlier.** It is first on the cut list. Scheduling it late, in an isolated module with no downstream consumer, is what makes dropping it a clean one-line removal rather than an unpicking exercise.

**End of day:** 10 beats.

---

## Day 8 — Receivables · slack absorption

| Track | Tasks |
|---|---|
| **B** | Receivables/udhaar tab in `KamaiView` using the `direction` field. |
| **A/C** | Whatever slipped from Days 6–7. |

**This day is intentionally under-committed.** Ten-day plans that are fully committed on day eight do not survive contact with a single slipped day. If nothing slipped, receivables ships — §15.2 calls it the retention hook and it is a genuinely strong answer to the "why would a worker log cash income?" question the doc predicts a judge will ask (§15.2, "Be ready for this question"). If something did slip, this is where it lands, and receivables is second on the cut list.

**End of day:** still **10 demo-loop beats**, plus receivables as a supporting feature. Receivables is not one of the §14.1 loop beats — it is a retention argument, not a stage moment — so shipping it does not advance the loop count and dropping it does not reduce it.

---

## Day 9 — Hardening · **CODE FREEZE at end of day**

| Track | Tasks |
|---|---|
| **A** | Input validation on every write endpoint (currently zero — `server.ts:40-47`). Rate limiting on `/api/assistant/process`, which is today unauthenticated, unvalidated, and unthrottled. |
| **B** | Error states and retry affordances on every screen. Strip the demo scaffolding at `HomeDashboard.tsx:341-364`. |
| **C** | **Redeploy** to the production target that has been live since Day 1. Seed-data polish. |
| **All** | **Decide and document the `USE_API` flag state for the demo build** — see below. Then run the full loop three times, on real devices, on real networks. |

### The `USE_API` flag decision — a required Day 9 deliverable

The flag that made Days 3–8 safe becomes a liability on stage if nobody has decided what it is doing. Write the answers down in the repo, in a short `DEMO_RUNBOOK.md`, and settle three things:

1. **Which screens are on the API in the demo build**, named individually. If any screen is still reading from localStorage on Day 9, that is a finding, not a detail — it means a screen never actually got migrated and the demo would be showing mock data while claiming persistence. Decide deliberately whether that ships or gets cut.
2. **Whether the flag stays compiled into the demo build at all.** Keeping it is a live contingency if a screen misbehaves mid-demo. Removing it eliminates the chance of an accidental flip and forces the API path to be genuinely working. Either is defensible; the untenable option is not choosing.
3. **If it stays: exactly one named person may flip it, and only between demo runs — never mid-run.** A flag that can silently revert a screen to localStorage needs an owner, because the failure mode is invisible: the screen still renders, the data still looks plausible, and the team believes they are demonstrating a database they are not touching. That is the single worst thing that could happen on stage, and it is worse than the screen simply erroring — an error is honest.

**Why this is Day 9 and not Day 10.** It may produce work — removing the flag, or migrating a screen that was quietly left behind — and Day 10 is frozen.

**Nothing new after 23:59 on Day 9.** The purpose of a freeze is not tidiness — it is that a feature added on Day 10 has never been rehearsed, and an unrehearsed feature is how a demo dies on stage.

---

## Day 10 — Rehearsal · buffer

No new features. Rehearse the loop until it is muscle memory. Prepare the honest-limitations slide: what is stubbed, what is seeded, what is roadmap. Confirm the fallback path for every beat — **what you do on stage if the venue wifi fails is itself a demo of the offline story**, so rehearse that as the plan rather than the disaster.

### Device checklist (P5, re-verified)

- **Both phones charged**, and a charger in the bag
- Both on the venue network **or** on mobile data, with the fallback decided in advance
- **QR scan tested at the venue, on the actual screen it will be shown on** — a code that scans cleanly in a lit room can fail on a dim projector, and this is the beat §14.1 says judges will remember
- The SIM still receiving SMS, tested that morning, not assumed from Day 2
- The demo worker account's login confirmed working on both devices

---

# Part 6 — Blocking Points and How Each Is Unblocked

| Blocker | Blocks | Unblock mechanism |
|---|---|---|
| `types.ts` not frozen | Everything | Day 1 morning, all three together, then locked |
| `server.ts` is one 390-line file | A and C colliding for ten days | Day 1 split into route modules on §5 boundaries |
| A's DB not ready until Day 3 | C's public passport | **Contract-first**: C works from frozen types + seed JSON, joins the DB on Day 4 |
| **Deployed URL not available** | Day 2's QR generation (a QR encoding `localhost` is useless off the developer's machine), Day 2's Firebase authorized-domains entry, Day 6's second-phone scan test on a real network | **Bare deploy to Render/Railway as Day 1 Track C task**, immediately after the `server.ts:25` port fix that it depends on. Day 9's deploy becomes a redeploy of an already-exercised target. |
| Firebase rejects sign-in from the deployed origin | Testing auth anywhere but localhost | Day 2 Track C adds the Day 1 deploy domain to Firebase → Authentication → Settings → Authorized domains, **before** the OTP go/no-go test |
| **Firebase billing not enabled (P4)** | Day 2 go/no-go entirely — the test cannot be run, so the decision slips and Day 3 starts on an open question | Day 0 / Day 1 prerequisite. Billing enables the capability, authorized domains permits the origin; **both are required before a single OTP sends** |
| Firebase OTP delivery uncertain | All authenticated routes | Day 2 go/no-go with a same-interface fallback (`requireAuth` unchanged either way) |
| **Gemini path never verified (P1)** | Amendment 2's entire premise — voice is first-class MVP, and the real AI path has never executed in this repo (`server.ts:11` returns null with no `.env`) | Day 1 Track A: ship the `source: 'fallback'` discriminator **first**, then curl until confirmed non-fallback. The discriminator moved from Day 6 to Day 1 because it *is* the verification mechanism |
| **Atlas IP not allowlisted (P2)** | Day 3's first authenticated API call — **and this is the likely cause when it fails** | Day 1 Track A. Note the failure mode: a **timeout**, not an auth error, so the team will suspect A's endpoint or B's auth wiring first. Check the allowlist before reading either file. Dynamic home IPs will need re-adding mid-week |
| **Secrets cannot travel through the repo (P3)** | B and C running the server at all, from Day 2 — `.gitignore:7` correctly blocks `.env*` | Day 1: agree a channel (password manager or platform secrets UI). Standing rule: **`.env.example` updated in the same commit that introduces any new key.** Specifically: the `/r/:token` HMAC secret must be byte-identical local vs. deployed, or review links fail across environments and present as a signature bug |
| **No second phone / no live SIM (P5)** | Day 2 OTP receipt, Day 6 QR scan on a second device, Day 10 rehearsal, the stage demo | Day 0 confirmation that two camera phones and one SMS-capable Indian SIM exist and work. Re-verified on the Day 10 checklist |
| B migrating 7 screens at once | The app being runnable | **`USE_API` per-screen flag**, shipped Day 3 |
| B and others both wanting `App.tsx` | Merge conflicts on the one file that breaks everything | **B owns it exclusively.** No exceptions. |
| Public routes needing the app router | C's Day 2 start | They do not — `/p/:handle` and `/r/:token` are **Express SSR routes**, fully independent of react-router. C never waits on B. |

---

# Part 7 — Demo Loop Progress

Substitutions from §14.1, both to be stated openly on stage: geo discovery is cut, so the customer reaches the worker by opening the QR passport rather than by searching nearby; before/after photos are cut.

| Day | Beats live end to end |
|---|---|
| 1 | 2 (voice job, voice earnings — no longer date-fragile). App is live at a public URL. |
| 2 | 2 + QR page renders against seed data, at a real scannable URL |
| 3 | 3 — onboarding is real and survives a device change |
| 4 | 5 — job created, completed, payment logged, review submitted |
| 5 | 7 — trust score updates, PDF exports |
| 6 | 9 — **QR scanned on a second phone; offline entry syncs on reconnect** |
| 7 | **10** — fair-price band. This is the maximum; the loop is complete. |
| 8 | 10 + receivables *(not a §14.1 beat — a supporting feature, so the count does not move)* |
| 9–10 | 10, frozen, hardened, rehearsed |

---

# Part 8 — Effort Estimates: What Is Guessed

Stated plainly so the plan can be adjusted rather than trusted.

**Reasonably confident** (the work is mechanical and the shape is known from reading the code): the Day 1 tasks; the `server.ts` split; the screen-by-screen API rewire on Day 5; QR generation.

**Estimated, moderate confidence:** the outbox at 1–2 days; the SSR passport page at ~1 day given `DigitalPassport.tsx`'s markup is directly reusable; the tap-entry form at ~1 day.

**Genuinely uncertain:**
- **Firebase OTP delivery to Indian numbers.** Could be 30 minutes or could fail entirely. This is why it starts on Day 1 morning and has a rehearsed fallback rather than an estimate.
- **Day 6 integration.** Named as the highest risk precisely because it cannot be estimated — it depends on how well three tracks that have not yet met agreed on the contract on Day 1.
- **The 40–45% figure** in `AUDIT_REPORT.md` for how much of the demo-scope system already exists. That is directional module-counting, not measurement.

**The plan is designed so that the three uncertain items each have an escape hatch** — the OTP fallback, the `USE_API` flag, and the cut order — rather than relying on the estimates being right.
