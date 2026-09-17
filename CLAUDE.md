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
- EVERY SERVER-SIDE REFUSAL NEEDS ITS UI BRANCH IN `JobsView`. A gate
  added on the route and not here leaves a button whose only possible
  outcome is a 403. There are two: `QUOTED` shows `quotedAwaiting`,
  `COMPLETED` shows `completedAwaiting` — both only when `customerId`
  is set, otherwise the one-tap path stands. The `COMPLETED` branch was
  missing for a release after the route started refusing it, and the
  worker screen offered "Mark payment received" the whole time.
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

## Area matching
NO COORDINATES EXIST ANYWHERE. `WorkerProfile.location` is free text
a worker typed, and `RateBand.locality` is never populated by the
seed. `lib/areas.ts` resolves that text to one of four tricity areas
by token match, so the product can say **"same area"** — the one true
thing it knows — rather than a distance computed from numbers
somebody invented. Do not add a fake lat/lng to make it look sharper.

`areaOf` returns `null` when nothing matches, and that is a real
answer: a worker in Delhi must never be filed under Chandigarh, or a
customer is shown "same area" about someone who is not.

`CUSTOMER_DEMO_TRADES` in `CustomerBrowse.tsx` must stay in step with
the seed AND with `Trade` in `customerCopy.ts`. It once listed only
Electrician and Plumber, which hid four of the six seeded passports —
and with them every worker outside Chandigarh, so area ranking had
nothing to rank and a working feature looked broken. A trade in the
set but missing from the copy table renders in English on a Hindi
screen; `getCustomerTrade` falls back rather than throwing, so that
failure is silent.

THE SERVER DECIDES DIRECTORY ORDER. `uniqueDirectoryProfiles` must
preserve the order it receives — it used to end with a client-side
`.sort()` by rating that discarded the area ranking, leaving the
"same area" badge on the right worker while they stayed buried. It
still decides which duplicate survives; that is a different question
from where it sits.

`?near=` RANKS, it does not filter — out-of-area workers stay in the
list below the local ones, because an empty directory is worse than
an unsorted one. An unrecognised area is ignored rather than
rejected: the worst case is the unranked list they would have had.
The sort runs in process, not in the query, because Mongo cannot run
`areaOf`; that is only affordable while the directory is six
unpaginated passports. Past a screenful, store the area and make it a
query again.

## Live updates
Polling, not SSE: `render.yaml` pins the FREE plan, which spins down
on inactivity, and a long-lived stream through that proxy is the
least predictable thing to demo. A missed poll needs no reconnect,
backoff or replay — the next tick does the work.

OFF until switched on, on both list screens, and the manual Refresh
button never goes away. During the demo an update that appears after
a tap is provably caused by that tap; an interval firing at the right
moment is not. `useLivePolling` skips ticks when the tab is hidden,
when one is already in flight, and when `paused` — which each screen
sets while the user is mid-action, so a refresh cannot pull a row out
from under a form being typed into.

`refreshJobs` in `App.tsx` MERGES via `mergeServerJobs`, never
replaces. A job recorded offline lives in React state and the outbox,
not the database — `setJobs(serverJobs)` would take it off a money
screen while it was still queued. Server wins for any job it knows
about; only local-only jobs the outbox still calls unsynced survive.
The mount-time load merges for the same reason.

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

### Browser checks run by default
The suite drives system Edge through `playwright-core` (no browser
download) and walks `CUSTOMER_DEMO.md` as written. It used to be gated
behind setting `PLAYWRIGHT_MODULE` by hand; nobody did, so it never
ran, and three defects shipped that live only in client code the API
tests cannot reach. A missing Edge is a loud SKIP, not a failure —
`SKIP_BROWSER_CHECKS=true` opts out deliberately.

It covers BOTH journeys: Neha's screens, then Ramesh's — the worker
half carries the other side of every trust boundary, and a gate that
exists on the route but not on the screen is invisible until somebody
taps it.

Three rules for anything added there, all learned the hard way:
- **Scope assertions to `#job-<id>`.** The customer's list holds a
  dozen requests by then. A first cut waited for a price on the whole
  page and passed instantly against a different job's quote — a green
  check proving nothing.
- **Assert order and absence, not just presence.** The ranking bug put
  the right badge on the right worker while they stayed buried; every
  presence check passed.
- **Foreground the page before waiting on a poll.** `useLivePolling`
  skips a tick while `document.hidden`, which is right for a real user
  and wrong for a backgrounded Playwright page that then waits forever.
  Call `bringToFront()` first and give the wait several intervals. This
  check passed one run and timed out the next before that was added.

Directory fixtures are inserted straight into `kaarigar_profiles` by
the test, because this run's database is empty — the seed script's six
kaarigars are not there. Their ratings are chosen so area ranking must
BEAT rating to pass.

## Booking commitments & reliability
`BOOKINGS_ENABLED` is the master switch and DEFAULTS TO FALSE. Off must stay
byte-for-byte the pre-feature behaviour: no booking created, no slot or arrival
code required, no event written, `/api/bookings` and `/api/workers/:handle/stats`
answer 404, and `trustScore` reads its original cancellation-rate source. Check
it with `bookingsEnabled()`, never `process.env` directly.

THE LEGACY RULE HOLDS IN BOTH FLAG STATES. A job with no linked booking keeps
today's one-tap path forever — the worker's own jobs, and everything seeded or
created before the flag went on. `bookingForJob()` returning null is the normal
legacy case, never an error and never a reason to refuse. Only customer-linked
jobs created while the flag is on get a booking.

RESPONDED IS NOT ACCEPTED. `BookingStatus` deliberately has no `ACCEPTED`,
because three different facts were competing for the word:
- `JobState.ACCEPTED` — the CUSTOMER agreed the price.
- `BookingStatus.RESPONDED` — the kaarigar replied inside `acceptBy` (they
  quoted). The haggle may still be running; there is no slot yet.
- `BookingStatus.COMMITTED` — a slot exists. `arriveBy` and the arrival code are
  set, and the lateness clocks start HERE and nowhere else.
Only `REQUESTED` and `COMPLETED` are spelled the same in both unions, and both
still mean different things. `KAARIGAR_RELIABILITY_FEATURE.md` §9.4 is the
authoritative mapping table.

THREE DEADLINES, AND WHICH ONE IS ARMED IS THE WHOLE DESIGN. `acceptBy` runs
only while `REQUESTED`. `scheduleBy` is armed ONLY when the customer accepts the
price, so no clock runs while the ball is in the customer's court — a quoted or
countered booking simply has no `scheduleBy` for the filter to match. `arriveBy`
exists only from `COMMITTED`. There is no special case anywhere that says
"skip this one"; absence of the field IS the rule.

`arriveBy` and `scheduleBy` are `$unset`, NEVER set to `null`. BSON orders null
below Date, so `{ arriveBy: { $lte: now } }` matches a null and the booking is
swept LATE the instant it is written. The sweep filters on status too, so
correctness does not rest on this — it is the second lock on the same door.

THE ARRIVAL CODE NEVER APPEARS IN A KAARIGAR-FACING RESPONSE. A kaarigar who can
read the code or its hash can check in from the other side of the city, and
`ON_TIME` is then worth nothing. `otpHash` / `otpAttempts` / `otpLockedUntil`
exist only on `BookingDoc` in `data/bookings.ts`; the contract `Booking` cannot
express them. `shapeBooking()` is the only way to turn a stored booking into a
client-facing one and it names each field rather than spreading-and-deleting, so
a new stored field is invisible until someone adds a line. The plain code is
returned by exactly two places: `commitSlot()` once (the worker's route drops it
on the floor) and `GET /api/bookings/:id/otp`, customer-only and
participant-checked.

ROUTES NEVER SET A BOOKING `status`. They call `bookings/transitions.ts`. Every
edge there is one conditional `findOneAndUpdate` naming the expected status, and
penalties go through `appendEvent`, which is idempotent on the unique
`{ bookingId, type }` index. A route that writes a status directly can skip a
deadline, a penalty or the job side-effect, and none of those omissions looks
wrong in review.

`/api/bookings` IS THE ONE PREFIX WITH NO MOUNT-LEVEL ROLE GATE, because it
serves both roles — a union gate would gate nothing. `requireAuth` is at the
mount; role AND participation checks live on each handler. A route added under
that prefix inherits authentication and nothing else.

The booking moves BEFORE the job on a worker transition, because the booking
carries the gates. Two collections mean no transaction; the failure mode is a
booking one step ahead of its job, which both screens render as "waiting". The
reverse — a job ahead of its booking — would be a job claiming a commitment
nobody made, so when only one write can win it must not be the job.

Deadlines are DATA, never timers. Render free spins the container down, so a
`setTimeout` holding a deadline dies with the process. They are applied on read
(`applyOverdue` on both list routes, `applyOverdueToOne` before any decision)
and by the external cron. `bookingConfig()` and `bookingsEnabled()` read
`process.env` on every call so the LATE demo and the tests can change windows
without a restart.

A WRONG ARRIVAL CODE IS 400, NEVER 401. `request()` in `lib/api.ts` treats
every 401 as an expired session and signs the user out, so a 401 there threw a
kaarigar back to the login screen over one mistyped digit. Any new refusal on
an authenticated route must not use 401 for anything but a dead session.

JobsView branches on `bookingsByJob[job.id]`. `undefined` is the legacy card,
untouched. With a booking, `ACCEPTED` shows the slot picker instead of the
one-tap "Schedule job", and `SCHEDULED` shows the arrival-code box instead of
"Start work" — a bare advance on either edge is a guaranteed 400. Refusals are
rendered from the error CODE into the copy tables, never the server's English
message. Panels close AFTER the transition and the trust-score refresh, so a
browser check must wait for `state: 'hidden'`, not assert instantly.

THE SWEEPER'S GATE IS A SECRET, AND A WRONG ONE MUST LOOK LIKE NOTHING.
`POST /api/internal/sweep` has no `requireAuth` — its caller is cron-job.org.
On a missing or wrong `x-sweep-secret`, or a `SWEEP_SECRET` under 32
characters, the handler calls `next()` and the request lands on the ordinary
`/api` JSON 404, so the refusal is byte-identical to a path that was never
built. That only works while `/api/internal` is mounted ABOVE that 404. The
secret is checked before the database, so the cold-start 503 is only ever shown
to a caller who proved they hold it. Flag off with the right secret is
`200 {enabled:false}`, not a 404. There is no GitHub Actions workflow for it,
deliberately — see `docs/SWEEPER.md`.

NO RELIABILITY PERCENTAGE WITHOUT A RECORD. A worker with no history sits at
the 0.8 prior and a response rate of 1 — deliberately, so nobody is scored as
bad for being new — but printed, that reads "80% reliable" about someone never
booked. `GET /api/workers/:handle/stats` returns `recordedEvents` and
`requestCount` beside `stats`; the passport card and the `/p/:handle` block show
a percentage only when the matching count is above zero, and words otherwise.
Both surfaces render nothing at all with the flag off.

### Verifying booking changes
    npm test                                   # transitions + scoring, injected clock
    npx tsx scripts/test-booking-routes.ts     # HTTP wiring, flag ON
    npx tsx scripts/test-sweeper.ts            # /api/internal/sweep over HTTP
    npx tsx scripts/test-booking-ui.ts         # JobsView + passport in Edge, flag ON
                                               # SCREENSHOT_DIR=<dir> saves PNGs of the new cards
Both use uniquely named throwaway databases. Run the existing
`scripts/test-customer-demo.ts` and `npm run test:regressions` too — with the
flag off they must pass completely unchanged, and that is the check that the
feature is really additive.

## Known gaps (post-SIH, not now)
- A counter-offer names a figure but carries no reason and no
  expiry, and the kaarigar has no one-tap "accept their number" —
  they re-quote by typing it. Counters are capped at 2 per job.
- A dispute records only that the customer rejected the completion
  claim. No reason, no photo, no moderation, no timeout — a job can sit
  in DISPUTED indefinitely if the kaarigar never returns.
- No payment verification.
- Matching is same-area-or-not, with four hardcoded tricity areas in
  `lib/areas.ts`. No distance, no travel time, no availability, and a
  worker outside those four resolves to `null` and never ranks. A real
  deployment needs a stored, structured location, not more tokens.
- No push. Live updates are opt-in polling on a 10s tick, so a change
  can take that long to appear and costs a request each time; with the
  toggle off, both sides still see changes only on reload.
