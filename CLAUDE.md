# Kaarigar — working notes for Claude Code

## Frozen contract
`src/types.ts` is shared across three tracks. Do not edit it
without asking. `JobItem` already has `customerId?: string`.

## Trust boundaries — do not weaken
- `POST /api/jobs` forces `kaarigarId = req.user.uid` and
  `status = 'REQUESTED'`. Never read `kaarigarId` from the body here.
- New job states go through `JOB_TRANSITIONS` only. The client
  never simulates a transition.
- Public profile responses must exclude `phone`, `totalEarnings`,
  `dailyRate`, `bloodGroup`.

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

## Known gaps (post-SIH, not now)
- `requireRole` is applied to zero routes.
- `DISPUTED` is orphaned in `JOB_TRANSITIONS`.