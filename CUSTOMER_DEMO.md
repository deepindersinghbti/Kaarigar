# Customer demo: Neha and Ramesh

This release exposes customer browse, request submission, request tracking, a per-request progress timeline, the customer's answers to a quote — accept, decline, or counter with a figure of their own — and their two answers to a completion claim — confirm or dispute — at `/customer`. It is not a completed customer marketplace. Payment verification, notifications, and nearest-worker matching are not implemented by this release; a counter-offer carries no reason or expiry, and a dispute no reason, evidence or moderation.

## Configure login

In the Render `kaarigar` service's Environment settings, keep the existing worker configuration and set:

- `DEMO_OTP_ENABLED=true`
- `DEMO_CUSTOMER_OTP_CODE`: a private six-digit code **different** from `DEMO_OTP_CODE`.

Set the same keys in the ignored local `.env` for local rehearsal. Never commit codes or use a `VITE_` prefix. Restart the local server after changing server environment variables. Deploy the new code and environment on Render. `/api/health` reports `customerDemoEnabled` without disclosing the code.

Neha's identifier is `0123456789`. This is a demo ID, not a real SMS destination. The server internally represents it as `+910123456789`, reserves it for the customer role, and creates a separate user record on the first successful login. It does not overwrite an existing account with a conflicting role; that case requires manual review.

## Rehearse

1. Use separate browser profiles, a private window, or separate devices for Neha and Ramesh. Ordinary tabs share the existing session storage and are not separate identities.
2. On the home page, choose **I need a Kaarigar**. Enter `0123456789`, then the private customer demo code.
3. Select Ramesh from the existing directory. Enter a fan installation request, location, and estimated budget. Submit once.
4. Neha sees the request under **My requests**. Ramesh sees the same database job in **Jobs** after loading/reloading that screen and sends a quoted price.
5. Neha can accept that stored quote. The server records her acceptance, copies the quoted price to `agreedPrice`, and does not accept a price supplied by the customer.
6. Neha can instead **decline** the price. The request goes back to `REQUESTED`, the withdrawn quote is cleared, and Ramesh can send a different price down the ordinary quoting path — the second quote is the one she then accepts. A plain decline names no figure of its own; for that, see the next step.
7. Or Neha can **offer a different price**: a counter-offer. The request goes back to `REQUESTED` the same way a decline does, but carrying her figure, which Ramesh sees on his own job card as "the customer asked for ₹900". He is not obliged to match it — he re-quotes at whatever he likes, by typing it, and that new number is the one Neha can then accept. This is the point worth making on stage: **her counter agrees to nothing.** `agreedPrice` is still only ever a copy of a price the kaarigar typed, so no customer can name their own figure and have it become what is owed. She may send the request back twice; after that she can accept, decline or cancel, and the server answers `counter_limit_reached`.
8. Neha can **cancel** the request outright while it is `REQUESTED`, `QUOTED` or `ACCEPTED`. Once Ramesh has scheduled or started, her cancel answers `409` and tells her to call him — the state machine still lets *Ramesh* cancel at that point, which is the asymmetry we intend.
9. **Show progress** on any request opens its `stateHistory`: every state, when it happened, and whether Neha or Ramesh caused it. The `ACCEPTED` row attributed to Neha is the point worth making — it is the one state on the job the kaarigar could not have written alone.
10. Every request names the kaarigar it went to. Ramesh's phone number appears — with a **Call** button — only once that job is `ACCEPTED` or later. Before acceptance Neha sees his name, handle and trade but no number, so browsing and collecting quotes is not a route to harvesting phone numbers out of the directory. `GET /api/kaarigars` and the public passport page still withhold it at every stage.
11. Ramesh marks the job **COMPLETED**. That is his CLAIM, not proof — the server refuses to let him take it on to `SETTLED` or `DISPUTED` himself, because the job carries Neha's customer ID. Neha sees "the kaarigar says this work is done" with two buttons.
12. **Yes, it is done** settles the job. That `SETTLED` row in the history is attributed to Neha, so it is the second state on the job Ramesh could not have written alone — the first being `ACCEPTED`.
13. **No, it is not done** puts the job in `DISPUTED` instead. This is not a dead end: Ramesh can move it back to `IN_PROGRESS`, finish the work, mark it complete again, and Neha answers again. Her phone link to him stays available throughout a dispute — that is when she is most likely to need it. Neither answer sends a reason; there is no moderation behind it and a dispute that carried one would imply there was.
14. Request creation records Neha as the actor and starts at `REQUESTED`, with payment pending. The customer's opening amount is an estimate, not proof of payment.
15. Customer and worker routes are role-gated on both the UI and API. Worker-created notes cannot attach themselves to Neha's account by supplying her customer ID.

Worker lifecycle controls are unchanged on the worker's own jobs — those with no customer ID still walk the whole line one tap at a time, including settling. On a job a customer raised, the worker keeps every state up to and including `COMPLETED` and loses only the two that answer it.

A `SETTLED` customer job IS customer-verified completion, and the `stateHistory` row naming the customer is the evidence. A `COMPLETED` one is not — it is the worker's claim awaiting an answer. Do not present the two as the same thing, and do not present either as proof of payment: `paymentMethod` is still `pending` and nothing in this release verifies money changing hands.

## Verification

`npx tsx scripts/test-customer-demo.ts` creates and removes a uniquely named test database using the configured MongoDB connection; it does not use the application's saved database name. It checks real authentication, roles, ownership, retries, and refresh. Set `PLAYWRIGHT_MODULE` to an installed Playwright `index.mjs` to include headless Edge UI checks, and `RUN_WORKER_REGRESSIONS=true` to run the existing worker regression suite in the same temporary database.

Run `npm run lint` and `npm run build` as well. Local tests do not prove a Render deployment or its environment is configured; verify the live page and health endpoint separately.
