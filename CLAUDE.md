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
- Quoting a customer's request requires a price; quoting the
  worker's own job does not. Requiring it everywhere breaks the
  worker lifecycle walk — 12 regressions, all downstream of one
  blocked edge.
- Public profile responses must exclude `phone`, `totalEarnings`,
  `dailyRate`, `bloodGroup`.

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
- `DISPUTED` is orphaned in `JOB_TRANSITIONS` (`DISPUTED: []`, and
  no state lists it as a target, so nothing can reach it).
- No negotiation (the customer accepts or does nothing — there is no
  counter-offer), no customer-side completion confirmation, no
  payment verification, no nearest-worker matching.
- Workers see new customer requests only on reload; no push.
