# Kaarigar — working notes for Claude Code

## Frozen contract
`src/types.ts` is shared across three tracks. Do not edit it
without asking. `JobItem` already has `customerId?: string`.

## Trust boundaries — do not weaken
- `POST /api/jobs` forces `kaarigarId = req.user.uid` and
  `status = 'REQUESTED'`. Never read `kaarigarId` from the body here.
- `customerId` is set ONLY from `req.user.uid` on the authenticated
  customer route. `createJob` ignores `body.customerId` entirely, so
  a worker cannot attach a job to a customer's account by sending
  their id. Do not reintroduce a body fallback.
- The customer route also overrides `customerPhone` from the token
  and pins `paymentMethod: 'pending'`, `agreedPrice: undefined`.
  A customer must not be able to self-declare a price as agreed or
  a job as paid.
- Role gates are mounted in `src/server/routes/index.ts` BEFORE the
  routers, not inside them: `/api/passport`, `/api/jobs`,
  `/api/ledger`, `/api/sync`, `/api/assistant`, `/api/quotes` and
  `/api/reviews/link` require `kaarigar`; `/api/customer` requires
  `customer`. Adding a route under those prefixes inherits the gate
  — a genuinely public endpoint needs its own prefix.
- New job states go through `JOB_TRANSITIONS` only. The client
  never simulates a transition.
- `quotedPrice` is the worker's proposal; `agreedPrice` is the
  customer's agreement. Only `POST /api/customer/jobs/:id/accept`
  writes `agreedPrice`, and it copies the stored `quotedPrice` —
  the accept endpoint reads NO price from the body. Keep it that
  way: `agreedPrice` being present is the only evidence that
  somebody other than the worker agreed to the number.
- A job WITH a `customerId` is accepted by the customer, never by
  the worker: `QUOTED -> ACCEPTED` on the worker's transition route
  is refused for those. Jobs with no `customerId` are the worker's
  own record and keep the one-tap path.
- `QUOTED -> REQUESTED` is the DECLINE edge, and a COUNTER-OFFER is
  the same edge with a number attached — one shared handler
  (`sendBackToWorker`), two routes. Anything taking it MUST clear
  `quotedPrice` (that handler + the `REQUESTED` branch of the
  worker's transition route): a withdrawn price left in place shows
  the customer a number nobody stands behind, and
  `quoted_price_required` reads as satisfied because the field is set.
  A plain decline also clears `counterPrice`; quoting clears it too,
  since taking `QUOTED` IS the answer to the counter.
- THREE PRICES, THREE SPEAKERS. `quotedPrice` the worker proposes,
  `counterPrice` the customer proposes, `agreedPrice` the customer
  accepts (only ever a copy of the stored `quotedPrice`).
  `counterPrice` is the ONLY price a request body may set, and that
  is safe only because it binds nobody: to become money owed, the
  worker must take `QUOTED` again — writing their own number — and
  the customer must accept THAT. Never let `counterPrice` reach
  `agreedPrice`, and never let accept read it.
- `MAX_COUNTERS` is 2, counted from `stateHistory` rather than
  stored: `countCustomerReturns` counts `REQUESTED` entries authored
  by that customer, which is exactly their own trips back (the only
  other way into `REQUESTED` is the worker withdrawing, authored by
  the worker). Declines count toward it too — the cap bounds the
  haggle, and decline-then-requote is the same loop with the numbers
  left implicit. Past the cap: accept, decline or cancel.
- `REQUESTED` alone does not mean declined — a new request is
  `REQUESTED` too. `stateHistory` separates them: now `REQUESTED` and
  ever `QUOTED` means declined. The decline route's idempotent replay
  depends on this; without it, declining a quote nobody sent reports
  success.
- `COMPLETED` is the worker's CLAIM that the job is done. On a job with
  a `customerId` the worker's transition route refuses BOTH
  `COMPLETED -> SETTLED` and `COMPLETED -> DISPUTED` — the answer is the
  customer's, via `POST /api/customer/jobs/:id/confirm` or `/dispute`.
  Same shape as `QUOTED -> ACCEPTED` one step earlier. Jobs with no
  `customerId` keep the one-tap settle. Never present a `COMPLETED`
  customer job as verified; `SETTLED` is the verified one.
- `DISPUTED` is reachable now and is NOT terminal:
  `DISPUTED -> IN_PROGRESS` lets the kaarigar return, redo the work and
  re-complete it. A dispute with no way out would freeze the job and
  mark the worker's record permanently. Neither confirm nor dispute
  reads the body — no reason, no amount, no evidence.
- Customer cancel stops at `ACCEPTED`, narrower than `JOB_TRANSITIONS`
  — past that the kaarigar has committed a slot. The worker's route
  still cancels later states. `CUSTOMER_CANCELLABLE` in
  `routes/customer.ts` is the authority; the copy in
  `CustomerRequests.tsx` only decides whether to draw the button.
- Quoting a customer's request requires a price; quoting the
  worker's own job does not. Requiring it everywhere breaks the
  worker lifecycle walk — 12 regressions, all downstream of one
  blocked edge.
- Public profile responses must exclude `phone`, `totalEarnings`,
  `dailyRate`, `bloodGroup`. Scope: `PUBLIC_PROJECTION` in
  `data/profiles.ts`, which backs `/p/:handle` and `GET /api/kaarigars`.
  A customer-scoped response about a job they own is NOT a public
  profile response and is not covered by this rule.
- The one such response is `GET /api/customer/jobs`, which joins the
  assigned kaarigar onto each row via `findAssignedKaarigars` — its
  OWN allowlist (handle, name, trade, phone), never a widening of
  `PUBLIC_PROJECTION`. The phone is released only in
  `CONTACT_VISIBLE_STATES` (`ACCEPTED` onward, plus `DISPUTED`,
  excluding `CANCELLED`): browsing and asking for quotes must not
  become a way to harvest numbers out of the directory. `DISPUTED` is
  in the list because it resolves via `DISPUTED -> IN_PROGRESS` — the
  kaarigar comes back, so the customer must still be able to ring
  them. The gate is per job state, so it lives in the route rather
  than the query — one worker can hold several of a customer's jobs
  in different states.

## Customer screens
Mount the customer tree as a SIBLING of `App` in `main.tsx`, never a
route inside it. `App` calls `GET /api/passport/me` on load, which
CREATES a kaarigar passport for the caller — mounting customers
inside `App` mints a stub worker profile for every customer and
lists them in the browse view they are using.

## Database
Local `.env` has no `MONGODB_DB_NAME`, so it defaults to `kaarigar`.
The deploy uses `kaarigar_sih_demo`. To seed the deployed DB:

    MONGODB_DB_NAME=kaarigar_sih_demo npm run seed

Never run `--reset` against `kaarigar_sih_demo`; it drops `jobs`,
including rows with outstanding review links.

## Deploy
`VITE_USE_API` is build-time inlined. Changing any `VITE_*` var
requires a full redeploy, not a restart.
Do not rotate `JWT_SECRET` — it invalidates every review link.

The customer demo login stays OFF until `DEMO_CUSTOMER_OTP_CODE` is
set to six digits AND differs from `DEMO_OTP_CODE` (both need
`DEMO_OTP_ENABLED=true`). While off, `/api/auth/otp/request` answers
`503` for Neha's id. Check `customerDemoEnabled` on `/api/health`;
it never discloses the code. Demo codes are server-side only — a
`VITE_` prefix would inline them into the browser bundle.
See `CUSTOMER_DEMO.md` for the rehearsal script.

## Gotchas
Mongo stores an absent optional number as NULL, not undefined. A job
that was never quoted comes back with `agreedPrice: null` even though
the type says `number | undefined`, so read prices with
`typeof x === 'number'`. `!== undefined` is true for null and renders
"₹null".

## Verifying job/customer changes
    npx tsx scripts/test-customer-demo.ts
    RUN_WORKER_REGRESSIONS=true npx tsx scripts/test-customer-demo.ts

Uses a uniquely named throwaway database, never the saved one. The
second form adds the worker lifecycle suite — run it for ANY change to
`/api/jobs/:id/transition`, which both roles depend on.

## Known gaps (post-SIH, not now)
- A counter-offer names a figure but carries no reason and no
  expiry, and the kaarigar has no one-tap "accept their number" —
  they re-quote by typing it. Counters are capped at 2 per job.
- A dispute records only that the customer rejected the completion
  claim. No reason, no photo, no moderation, no timeout — a job can sit
  in DISPUTED indefinitely if the kaarigar never returns.
- No payment verification, no nearest-worker matching.
- Workers see new customer requests only on reload; no push.
