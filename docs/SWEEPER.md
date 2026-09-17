# The booking sweeper

`POST /api/internal/sweep` applies every overdue booking deadline in one pass.
An **external cron service** calls it every 10 minutes. There is no timer inside
the server, and there must not be one.

## Why it exists

Render's free plan spins the container down after ~15 minutes idle. A
`setTimeout` or `node-cron` job holding a deadline dies with the container, so
deadlines in Kaarigar are **data** — a date on the booking — rather than timers.

Most deadlines are applied **on read**: every job list, booking read and job
transition runs the overdue rules for the bookings it touches before deciding
anything. The sweeper covers the case reads cannot: **bookings nobody opens**.
A kaarigar who never opens the app again would otherwise never be marked
`NO_SHOW`, because the only code that could mark them would never run.

So the sweeper is a backstop, not the main mechanism. If it misses a tick,
nothing is lost. The next tick applies the missed deadline, and any read in the
meantime does too. The penalty is timestamped when the rule runs, not when the
deadline passed, so the only effect of a missed tick is a record that lands a
little later.

## What one call does

In this order, up to `SWEEP_BATCH_SIZE` (default 200) bookings per rule:

| # | Rule | Event written |
|---|---|---|
| 0 | A proposed new time still unanswered at the original slot is closed; the original slot stands | none |
| 1 | `REQUESTED` past `acceptBy` → `EXPIRED`, job cancelled | `EXPIRED` (weight 0) |
| 2 | `RESPONDED` past `scheduleBy` → `EXPIRED`, job cancelled | `LATE_CANCEL` |
| 3 | `COMMITTED` past `arriveBy` → `LATE` | `LATE` |
| 4 | `LATE` past `arriveBy + NO_SHOW_AFTER_MIN` → `NO_SHOW`, job cancelled | `NO_SHOW` |

Rule order matters: one call can take a long-abandoned booking through 3 and 4
and correctly leave both events.

**It is idempotent.** Each move is a conditional update naming the status it
expects, and the ledger has a unique `{ bookingId, type }` index. Calling it
twice in a row, or twice at once, cannot apply anything twice. The second call
returns all zeros.

A full batch means there is more to do. The next tick picks it up. At this
project's size that never happens, and if it ever does, a deadline measured in
hours can wait ten more minutes.

## Responses

| Situation | Status | Body |
|---|---|---|
| Header missing or wrong, or `SWEEP_SECRET` unset or under 32 characters | **404** | The ordinary `{"error":"not_found","message":"No handler for POST /api/internal/sweep"}`, identical to any path that was never built |
| Right secret, database not connected yet (cold start) | **503** | `{"error":"database_unavailable",...}` |
| Right secret, `BOOKINGS_ENABLED` off | **200** | `{"enabled":false,...}`, and nothing is swept |
| Right secret, swept | **200** | `{"enabled":true,"expired":0,"late":0,"noShow":0,"scheduleExpired":0,"rescheduleAutoRejected":0,"ranAt":"…","durationMs":…}` |
| Something threw | **500** | `{"error":"sweep_failed",...}`. Safe to run again |

`GET` is always a 404, because only `POST` sweeps. The secret must be in the
`x-sweep-secret` header. It is never read from the query string, where it would
end up in access logs.

**A 404 means the secret did not match or is not configured.** The endpoint
deliberately gives no other hint. A 503 is only shown to a caller who sent the
right secret, so it always means the same thing: the server is up but has not
reached the database yet.

## Setup

### 1. Generate the secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This prints 64 hex characters. Anything under 32 characters is refused.

### 2. Set it on Render

Render dashboard → **kaarigar** → **Environment**, and set:

| Key | Value |
|---|---|
| `SWEEP_SECRET` | the value from step 1 |
| `BOOKINGS_ENABLED` | `true`, once the feature is ready to go live |
| `CHECKIN_OTP_SECRET` | a *separate* 64-character value, generated the same way |

All three are declared in `render.yaml` with `sync: false`, so Render prompts for
them rather than storing them in the repository. Saving environment changes
restarts the service. None of these are `VITE_` variables, so no rebuild is
needed.

**`SWEEP_SECRET` is safe to rotate** at any time: generate a new one, set it on
Render, then update the cron job. Calls in between return 404 and nothing
breaks. It is unrelated to `JWT_SECRET`, which must **not** be rotated.

### 3. Create the cron job on cron-job.org

Create a free account at [cron-job.org](https://cron-job.org), then **Create
cronjob**:

| Setting | Value |
|---|---|
| Title | `Kaarigar booking sweep` |
| URL | `https://kaarigar.onrender.com/api/internal/sweep` |
| Schedule | Every **10 minutes** (custom crontab `*/10 * * * *`) |
| Request method *(Advanced)* | **POST** |
| Headers *(Advanced)* | `x-sweep-secret` = the value from step 1 |
| Timeout *(Advanced)* | the longest the plan allows |
| Notifications | on failure, after a few consecutive failures |

Then use **Test run**. A healthy response is `200` with `"enabled":true` (or
`"enabled":false` if the flag is still off).

**About cold starts.** A cold Render instance takes ~50 seconds to answer, which
may be longer than cron-job.org's request timeout. Check the current limit in
its settings, because it may change. If a sweep times out while waking the
instance, the request still wakes it, and the next tick succeeds. The standing
UptimeRobot monitor (see `README.md`, "Keeping the deploy warm") pings every 5
minutes, so the instance is normally already warm when the sweep arrives. Set
failure alerts to trigger after **several consecutive** failures rather than
one, or every cold start will page someone.

**Why not GitHub Actions.** `.github/workflows/keep-warm.yml` records why a
`schedule:` trigger was rejected. This repository is private, Actions bills per
job rounded up to the minute, and a 10-minute cadence would use roughly double
the free allowance. There is intentionally no workflow file for the sweeper.

## Checking it by hand

```bash
curl -i -X POST https://kaarigar.onrender.com/api/internal/sweep -H "x-sweep-secret: $SWEEP_SECRET"
```

Run it twice. The second call should report zeros for everything, unless a new
deadline happened to pass in between.

```bash
curl -i -X POST https://kaarigar.onrender.com/api/internal/sweep -H "x-sweep-secret: wrong"
```

This should be a plain 404.

The server logs one `[sweep]` line only when a sweep actually moved something,
and nothing when it moved nothing, so an idle cron does not bury the lines that
matter. If `SWEEP_SECRET` is missing or too short, the first sweep request
logs one warning saying so.

## Demonstrating LATE → NO_SHOW without waiting a day

Shorten the windows on the demo instance (see the booking windows under
"Optional" in `.env.example`), walk a booking to a committed time slot, wait
two minutes, and
call the sweep by hand with `curl`. Say plainly that the windows were
shortened: the mechanism is real, only the clock was sped up. **Put the windows
back afterwards**, or every real request expires within two minutes.

## Tests

```bash
npx tsx scripts/test-sweeper.ts
```

This uses a throwaway database. It seeds bookings that are already overdue,
sweeps twice over HTTP (the first call moves them, the second moves nothing),
and covers every wrong-secret variant, the flag being off, overlapping sweeps,
and a database that is not connected.
