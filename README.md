# Kaarigar

A portable, QR-verifiable professional identity, earnings ledger and fair-pricing
platform for India's skilled trade workers. Smart India Hackathon 2026.

- `Kaarigar_Architecture_v1.pdf` — the target architecture
- `MIGRATION_PLAN.md` — the authoritative 10-day build plan. **This governs.**
- `AUDIT_REPORT.md` / `GAP_MATRIX.md` — prototype audit against the architecture
- `TYPES_PROPOSAL.md` — record of the `src/types.ts` freeze decisions

## Run locally

**Prerequisites:** Node.js 20+, and a MongoDB Atlas connection string.

**This project uses npm.** `package-lock.json` is the committed lockfile — do not
install with another package manager, or the two lockfiles will disagree.

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env
```

`.env.example` documents every variable and which are secret. At minimum you need
`GEMINI_API_KEY`, `MONGODB_URI` and `JWT_SECRET` — the server starts without them
but voice extraction silently falls back to a keyword matcher, and anything
touching the database or auth will fail.

```bash
npm run dev
```

Then open http://localhost:3000.

## Verifying the setup

`GET /api/health` reports whether each dependency actually came up:

```bash
curl -s http://localhost:3000/api/health
```

```json
{
  "status": "ok",
  "hasGeminiKey": true,
  "db": { "connected": true, "error": null },
  "appName": "Kaarigar Saathi"
}
```

`hasGeminiKey` reports only that a key is *loaded*, not that Gemini works. Every
assistant response carries a `source` field of `gemini` or `fallback` — that is
the discriminator, and both paths otherwise return a well-formed 200.

A **timeout** connecting to Atlas almost always means your IP is missing from the
Network Access allowlist, not that the URI or password is wrong.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Express + Vite middleware on :3000 |
| `npm run build` | Client bundle to `dist/`, server to `dist/server.cjs` |
| `npm start` | Run the production build |
| `npm run lint` | `tsc --noEmit` |

## Layout

```
server.ts                    bootstrap only
src/server/db.ts             Mongo connection
src/server/routes/           one module per Architecture §5 service boundary
src/server/middleware/       requireAuth, requireRole
src/server/auth/             token signing and verification
src/components/              React screens
src/types.ts                 FROZEN cross-track contract
```

`src/types.ts` is frozen. It changes only by agreement of all three tracks — if a
task appears to need a change there, stop and raise it.

## Auth

The app uses its own OTP endpoints. **Only delivery is stubbed** — the code is
written to the server log instead of being sent by SMS. Every security property
is real:

| Property | Implementation |
|---|---|
| Code generation | `randomInt(0, 1000000)` — cryptographically secure |
| Storage | Only a hash is stored, never the code |
| Expiry | 5 minutes |
| Attempt cap | Enforced; returns 429 once exceeded |
| Single use | Challenge burned before tokens are issued |
| Throttling | Capped codes per number per window |
| Enumeration resistance | Identical response whether or not the number is known |
| Tokens | 15-minute access, rotating refresh, reuse detection revokes the family |

`requireAuth` is the swap point. If Firebase starts working, one line changes.

### Firebase phone OTP: what is actually wrong

Recorded because §6.4 of the status report left this as an *unconfirmed*
hypothesis, and that hypothesis has since been disproved. Do not spend time
re-deriving it.

Tested from both origins with `otp-test.html` on 30 August 2026:

| Origin | Result |
|---|---|
| `localhost` (authorised by default) | `INVALID_APP_CREDENTIAL` |
| `kaarigar.onrender.com` | `CAPTCHA_CHECK_FAILED: Hostname match not found` |

**These are two separate faults.** The deploy has an additional domain-allowlist
problem layered on top of the original one; localhost isolates that away and
still fails.

**The "backend provisioning lag on a new project" hypothesis is dead.** It was
the main reason to believe waiting would help. Days have passed and localhost
fails identically.

What is confirmed working, so nobody re-checks it:

- The reCAPTCHA widget renders and solves; a ~2,300-character token is produced
- The request carries all five expected fields: `phoneNumber`, `clientType`,
  `captchaResponse`, `recaptchaVersion`, `recaptchaToken`
- `recaptchaParams` and `recaptchaConfig` both return HTTP 200
- reCAPTCHA Enterprise is **not** enforced (`ENFORCEMENT_STATE_UNSPECIFIED` for
  `PHONE_PROVIDER`), so Enterprise misconfiguration is ruled out
- The phone provider is enabled, or the error would be `auth/operation-not-allowed`
- Billing is enabled, or the error would be `auth/billing-not-enabled`

The client side is therefore fine. Google is rejecting a valid-looking token at
the **project** level.

**Not yet eliminated**, and the two best remaining candidates:

1. **App Check enforcement** — Firebase Console → App Check → APIs →
   Authentication. If enforcement is on, every request without an App Check
   attestation is rejected, and the harness sends none. This matches the symptom
   most closely and was never on the ruled-out list.
2. **API key *API* restrictions**, which are distinct from referrer
   restrictions — Google Cloud Console → APIs & Services → Credentials → the
   browser key. **Identity Toolkit API** and **Token Service API** must both be
   permitted. Correct referrers do not help if the API itself is excluded.

If neither: create a **fresh Firebase project**, enable Phone sign-in and
billing, put the new four values in `.env`, and retest on localhost. Fifteen
minutes, and decisive — a fresh project working proves the current one is
half-provisioned, which no further console-poking will fix.

**Before testing from the deploy again**, add `kaarigar.onrender.com` to Firebase
Console → Authentication → Settings → Authorized domains, or the hostname fault
masks whatever the real one is.

### Why this is not a blocker

`MIGRATION_PLAN.md` Day 2 pre-authorised the fallback: `requireAuth` presents the
same `req.user` either way, so nothing downstream depends on which path issued
the token. §14.1 is explicit that a clearly-labelled stub is acceptable and that
claiming a live integration you do not have is the fastest way to lose a panel.

Note also that Firebase is not interchangeable with an SMS gateway. Firebase
**replaces** these OTP endpoints — Google generates, delivers and verifies its
own code. Sending *our* codes through a gateway (MSG91, Twilio, AWS SNS) instead
requires TRAI **DLT registration**: a Principal Entity, a registered sender
header, and a registered template, which needs a registered entity and takes
days at minimum. Firebase was chosen precisely to sidestep that, which is why
"just use Twilio" is not a same-week substitute.

## Keeping the deploy warm

The Render free instance **spins down after ~15 minutes idle and cold-starts in
~50 seconds.** A customer or a judge scanning the passport QR would stare at a
blank screen for most of a minute, which fails the project's stated
differentiator in the most visible way available. The service therefore needs a
standing external monitor.

### The standing monitor is UptimeRobot

Configure one HTTP keyword monitor:

| Setting | Value |
|---|---|
| Monitor type | **Keyword** |
| URL | `https://kaarigar.onrender.com/api/health` |
| Keyword | `"connected":true` |
| Alert when | **Keyword NOT found** |
| Interval | **5 minutes** |
| Request timeout | 90 seconds or more |

**Why a keyword monitor and not a plain HTTP(s) check.** A plain check passes on
any 200, and `/api/health` returns 200 with `{"db":{"connected":false}}` when the
process is up but Atlas is unreachable. Warm but broken is still broken, and
between rehearsals this monitor is the only thing watching the deploy. Matching
on `"connected":true` and alerting on its absence catches both failures — the
service being down, and the service being up without its database — with one
monitor and one condition.

**Why 5 minutes.** Comfortably inside the ~15-minute spin-down window, so two
consecutive polls can be missed without the instance sleeping.

**Why the timeout must be generous.** A cold start takes ~50s. A 30-second
timeout would record a failure for the very request that successfully woke the
service.

### Why not GitHub Actions on a schedule

It was tried and rejected. Actions bills per job **rounded up to the minute**,
and this repository is **private**, so it draws on 2,000 free minutes per month
rather than the unlimited pool public repositories get. A cadence tight enough to
beat the spin-down costs roughly **1,950 of those 2,000 minutes** — nearly the
whole CI allowance, for a repository that will want CI before Day 9 — and
Actions' scheduled triggers are best-effort and run late under load, so the
budget would be spent on a trigger that still misses windows.

`.github/workflows/keep-warm.yml` survives as **`workflow_dispatch` only**: a
manual warmer to run immediately before a rehearsal or the demo, rather than a
schedule.

### Why not a self-ping inside the server

It cannot work. Render spins the **container** down, so a `setInterval` in the
server process stops along with everything else. A timer that dies alongside the
thing it was meant to wake cannot wake it, and one missed tick leaves the service
asleep with the only component that could fix it asleep too.

## Demo OTP bypass

For the stage demo, a fixed OTP can be enabled for **one** seeded number, so
login does not depend on venue reception or an SMS arriving inside a 90-second
window. See `DEMO_OTP_*` in `.env.example`.

It is **off unless all three variables are set and well-formed**, it is
**server-side only** (no `VITE_` prefix, so it cannot reach the browser bundle),
and it is **scoped to one number** — every other number takes the normal path
with the submitted code never examined. The fixed code is never logged, returned,
or placed in an error.

Enable it in the Render dashboard for the demo; leave it unset everywhere else.

## Temporary: `otp-test.html` is in the production build

**REMOVE BEFORE THE FINAL DEMO BUILD.**

`vite.config.ts` builds `otp-test.html` as a second entry point, so the Firebase
phone-OTP harness is reachable on the deploy at `/otp-test.html`. It is there for
one reason: the §6.4 go/no-go has only ever been run from `localhost`, which
Firebase authorises by default, so it has never exercised the real deployed
origin — the confound that retest was supposed to remove.

**What it costs while it is there.** The page is public and unauthenticated, and
pressing its button spends SMS quota against our Firebase billing. It is
rate-limited by Firebase, not by us. That is acceptable for a few days on an
unadvertised URL. It is not acceptable in the build that ships to a demo.

**To remove it:** delete the `build.rollupOptions.input` block in
`vite.config.ts` (the `main` entry is the default), and delete `otp-test.html`
and `otp-test.ts` once the go/no-go is recorded — the harness itself says it is
throwaway.
