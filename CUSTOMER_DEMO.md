# Customer demo: Neha and Ramesh

This release exposes customer browse, request submission, request tracking, a per-request progress timeline, and the customer's three answers — accept the quoted price, decline it, or cancel the request — at `/customer`. It is not a completed customer marketplace. Counter-offers, customer completion confirmation, payment verification, notifications, and nearest-worker matching are not implemented by this release.

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
6. Neha can instead **decline** the price. The request goes back to `REQUESTED`, the withdrawn quote is cleared, and Ramesh can send a different price down the ordinary quoting path — the second quote is the one she then accepts. Declining names no figure of its own; that would be a counter-offer, which this release does not have.
7. Neha can **cancel** the request outright while it is `REQUESTED`, `QUOTED` or `ACCEPTED`. Once Ramesh has scheduled or started, her cancel answers `409` and tells her to call him — the state machine still lets *Ramesh* cancel at that point, which is the asymmetry we intend.
8. **Show progress** on any request opens its `stateHistory`: every state, when it happened, and whether Neha or Ramesh caused it. The `ACCEPTED` row attributed to Neha is the point worth making — it is the one state on the job the kaarigar could not have written alone.
9. Every request names the kaarigar it went to. Ramesh's phone number appears — with a **Call** button — only once that job is `ACCEPTED` or later. Before acceptance Neha sees his name, handle and trade but no number, so browsing and collecting quotes is not a route to harvesting phone numbers out of the directory. `GET /api/kaarigars` and the public passport page still withhold it at every stage.
10. Request creation records Neha as the actor and starts at `REQUESTED`, with payment pending. The customer's opening amount is an estimate, not proof of payment.
11. Customer and worker routes are role-gated on both the UI and API. Worker-created notes cannot attach themselves to Neha's account by supplying her customer ID.

Existing worker lifecycle controls remain unchanged. Do not present worker-entered completion or payment as independently customer-verified evidence.

## Verification

`npx tsx scripts/test-customer-demo.ts` creates and removes a uniquely named test database using the configured MongoDB connection; it does not use the application's saved database name. It checks real authentication, roles, ownership, retries, and refresh. Set `PLAYWRIGHT_MODULE` to an installed Playwright `index.mjs` to include headless Edge UI checks, and `RUN_WORKER_REGRESSIONS=true` to run the existing worker regression suite in the same temporary database.

Run `npm run lint` and `npm run build` as well. Local tests do not prove a Render deployment or its environment is configured; verify the live page and health endpoint separately.
