# Kaarigar SIH Demo Runbook

This is the single repeatable setup for the SIH prototype. The demo build uses
the real API for every data domain and never relies on the browser's bundled
sample rows.

## Frozen demo choices

- Branch: `codex/sih-mvp`
- Roles: worker and customer reviewer only
- Trades: electrician and plumber only
- API mode: `VITE_USE_API="all"`
- Demo worker user id: `usr-demo-ramesh`
- Demo worker phone: `+919876543210`
- Demo passport: `ramesh-kumar-chd`
- Ordinary job creation always starts at `REQUESTED`
- Job progress uses `POST /api/jobs/:id/transition`; never edit status in MongoDB
- Payment is logged separately after work is completed

No teammate should change these choices during a rehearsal without telling the
person running both phones.

## Required environment

Keep real values in `.env` locally or in the Render environment. Never paste
them into source, screenshots, chat, or this file.

```dotenv
MONGODB_URI="<demo database connection string>"
MONGODB_DB_NAME="kaarigar_sih_demo"
JWT_SECRET="<at least 32 random characters>"
REVIEW_LINK_SECRET="<a different random secret>"
GEMINI_API_KEY="<server-side key>"
VITE_USE_API="all"
PUBLIC_ORIGIN="https://kaarigar.onrender.com"
DEMO_OTP_ENABLED="true"
DEMO_OTP_PHONE="+919876543210"
DEMO_OTP_CODE="<six digits known only to the presenters>"
```

`VITE_USE_API` is embedded at startup/build time. Restart the dev server or
redeploy after changing it.

## Safe local preparation

Use a disposable local/demo MongoDB, never production. From
`C:\Dev\Kaarigar`:

```powershell
git branch --show-current
npm ci
npm run lint
npm run build
```

The branch command must print `codex/sih-mvp`.

Only after confirming that `MONGODB_URI` points to the disposable database:

```powershell
npm run seed -- --reset
npm run seed:rates -- --reset
npm run check:demo-seed
npm run check:rates
```

`--reset` drops demo collections. Never run either reset command against
production. Running `npm run seed` without `--reset` is idempotent and leaves
unrelated rows alone.

Start the app:

```powershell
npm run dev
```

In a second terminal:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
npm run test:regressions
```

The health response must report `status: ok` and `db.connected: true`.

## Before each rehearsal

1. Confirm `https://kaarigar.onrender.com/api/health` reports a connected DB.
2. Confirm the deployed build was built with `VITE_USE_API=all`.
3. Sign in on the worker phone with the fixed demo number and stage-only OTP.
4. Open an incognito/private window on the customer phone.
5. Confirm the worker sees `job-101` through `job-104`.
6. Create one new job for the rehearsal. It must display `Requested`.
7. Advance it with the on-screen lifecycle button; do not edit the database.
8. Use a freshly generated customer review link.

## Judge flow

1. Worker signs in.
2. Worker checks a cited electrician or plumber rate.
3. Worker creates and shares an itemised quote.
4. Worker creates a job; it starts at `REQUESTED`.
5. Worker advances it through quoted, accepted, scheduled, in progress, and completed.
6. Worker records payment separately and marks the job settled. Prefer voice;
   use **Type payment** as the venue-safe fallback.
7. Customer opens the signed review link and submits ratings.
8. Public QR passport shows server-derived work and review evidence.
9. Worker downloads the six-month income statement PDF.
10. Worker logs one earning offline, reconnects, and shows the sync badge clear.

Kamai must show actual day, last-seven-day, and current-month net values. It
must never show the removed hardcoded forecast or target percentage. Outgoing
and reversal entries must reduce/cancel the displayed total just as they do in
the server-generated PDF.

## Reset between rehearsals

Prefer creating a fresh rehearsal job each time. If a complete reset is needed,
stop the server, reconfirm the database name is the disposable demo database,
then repeat the two `--reset` seed commands. Review links from the previous
reset become unusable because their jobs were replaced.

## Stop conditions

Do not start the judged demo if any of these is true:

- the health endpoint reports `db.connected: false`;
- the worker sees bundled sample data while signed out of the API;
- a newly created job appears as completed;
- lifecycle controls are disabled after the job has synced;
- the rate check reports an uncited/suppressed demo task;
- the regression or demo-seed check fails.
- Kamai shows a hardcoded forecast/target or renders every ledger row as positive.

## What remains manual in Run 11

Codex can prepare and locally verify the code, but the final completion gate is
physical: one worker phone and one customer phone must run the deployed flow.
Record the phone/browser versions, whether the worker phone was put offline,
the time from reconnect to a cleared sync badge, and any presenter intervention.
