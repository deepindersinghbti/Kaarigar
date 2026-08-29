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

Firebase phone OTP could not be made to deliver (see `TYPES_PROPOSAL.md` history
and the auth commit). The app currently uses its own OTP endpoints with
**identical architecture and stubbed delivery only** — the code is written to the
server log rather than sent by SMS. Everything else is real: hashed codes,
expiry, attempt caps, single use, throttling, signed JWTs, 15-minute access
tokens and rotating refresh tokens with reuse detection.

`requireAuth` is the swap point. If Firebase starts working, one line changes.
