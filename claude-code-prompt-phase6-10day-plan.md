# Claude Code — Phase 6 prompt (10-day finals plan)

Paste into the same Claude Code session that produced Checkpoint 2.

---

Timeline confirmed: **10 days, 3 developers.** Plan Phase 6 against this constraint, not against the full architecture. Scope aggressively and state plainly what you are cutting and why.

## Standing corrections to your Checkpoint 2 report

Apply these before you plan, and reflect them in the deliverable files:

1. **Backend language: keep Express/TypeScript. Do not port to FastAPI.** Move `server.ts` from bucket 3 to bucket 2 (keep-and-extend). Treat the nine service modules in §5 as router/module boundaries inside the existing Express app. A rewrite buys zero functional capability and adds a second runtime to a three-person team; §5.2's own argument against premature splitting applies to its own stack choice. Record this as a documented amendment to the architecture.
2. **Voice is reinstated as a first-class MVP input.** Move `VoiceAssistantModal.tsx` from bucket 3 to bucket 2. §4 Module H dropped it on build-risk grounds that no longer apply, since the 908 lines already exist and work. Second documented amendment.
3. **Recalculate the salvage percentages** with `server.ts` and `VoiceAssistantModal.tsx` in bucket 2.
4. **Qualify the "15-20% of the system" figure** — note explicitly that it measures against the full production architecture including Later/V1 scope, not against the §14.1 demo scope, against which the gap is far smaller.

## Scope decisions — locked

### CUT: WatermelonDB and causal-order sync
Replace with a minimal outbox built on the existing localStorage layer: queue mutations that fail or are attempted offline, flush on reconnect, render per-record pending/synced/failed state. Roughly 1-2 days instead of 5, and functionally identical on stage. Note in `MIGRATION_PLAN.md` that the append-only ledger design keeps the WatermelonDB migration mechanical at V1.

### CUT entirely — roadmap slide only
Media/photo upload and portfolio capture · DigiLocker · e-Shram · UPI · W3C verifiable credentials · consent artifacts · audit log · admin console · Celery/async workers · OCR · geo/2dsphere discovery search · skilling module · crew mode.

### BUILD — cheap versions only
- **Fair-price engine:** `rate_bands` as a statically seeded collection (~30 task rates from CPWD/state schedules) with a lookup endpoint and a band display. No ML, no observation feedback loop.
- **Trust score:** simple computed rubric. No fairness machinery, no appeals, no rate-limited decline.
- **Receivables/udhaar:** a `direction` field plus a tab. Only if there is slack.

### BUILD properly — non-negotiable
- Firebase phone OTP auth + `users` collection + RBAC middleware enforced server-side
- MongoDB Atlas as system of record, replacing localStorage
- react-router (also required for the public routes below)
- `GET /p/{handle}` — SSR public passport page with a real generated QR code
- `GET /r/{token}` — signed, single-use, job-bound review link; no customer account required
- Tap-entry job/earnings form as the offline write path alongside voice
- Income statement PDF export

### Agreed cut order if the schedule slips
Drop in this order, one at a time: **(1) fair-price engine, (2) receivables, (3) PDF export.** Do not touch QR passport, auth, or persistence — those three are what distinguish a built system from a mockup. Build the plan so these cuts are clean, i.e. no later task depends on a droppable one.

## Day 1 blockers — sequence these first

- **Verify Firebase phone OTP actually delivers to a real Indian mobile number.** Billing enablement and DLT/SMS routing are a known failure mode. If it is not working by end of Day 2, fall back to our own OTP endpoint that logs the code server-side, with real JWT issuance and real session handling behind it — identical architecture, stubbed delivery only. Put this decision point explicitly in the Day 2 plan.
- Fix the hardcoded port at `server.ts:25` to `process.env.PORT || 3000`.
- Resolve the lockfile mismatch: delete `bun.lock` or fix the README `npm install` instruction. Pick one and make the README match.
- Remove the date-pinning in `initialData.ts` and the literal "today" comparisons in `HomeDashboard.tsx:52-53`, `HomeDashboard.tsx:257`, and `KamaiView.tsx:35-36`.
- Freeze `types.ts` as the API contract so tracks A and B can work independently against it.

## Team split

Assign every task to exactly one track so the three can run in parallel with minimal collision:

- **Track A — data/backend:** Mongo schemas, API routes, auth middleware, RBAC, seed data
- **Track B — app rewire:** router, replacing localStorage reads with API calls, outbox and sync badges, tap-entry form. **B exclusively owns `App.tsx`; nobody else edits it.**
- **Track C — public surfaces:** `/p/{handle}` SSR passport, QR generation, `/r/{token}` review flow, PDF export

## What to produce

**A day-by-day plan, Days 1 through 10**, with every day's tasks assigned to A, B, or C. Requirements for the plan:

- Every day must end with a runnable app. No day may leave the repo broken.
- **Code freeze at end of Day 9.** Day 10 is rehearsal, seed-data polish, and buffer only — no new features.
- Flag every point where one track's work blocks another, and say how to unblock it (stub, mock, contract-first).
- Mark for each day which parts of the §14.1 demo loop are working end to end by that evening.
- Identify the single highest-risk day and say what the contingency is.
- Where you are estimating effort, say so — do not present guesses as certainties.

Then write the three deliverable files: `AUDIT_REPORT.md`, `GAP_MATRIX.md`, `MIGRATION_PLAN.md`, with the day-by-day plan in `MIGRATION_PLAN.md` and both architecture amendments recorded there.

Explain your sequencing reasoning in plain language, not just the schedule — I need to defend these choices to my team and adjust if a day slips.
