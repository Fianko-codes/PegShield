# PegShield Dashboard

Snapshot-backed frontend plus read-only Vercel API for the PegShield Solana LST risk oracle.

## What it does

- Serves the React dashboard for `PegShield`
- Exposes `GET /api/oracle-state` to read the live `mSOL` oracle PDA from Solana devnet
- Exposes `GET /api/simulation` to serve the historical replay snapshot
- Falls back to `public/data/*.json` if the API is unavailable

## Local commands

```bash
npm install
npm run sync:data
npm run build
```

## Vercel env vars

Set these in the Vercel project:

```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea
ORACLE_LST_ID=mSOL
```

`PROGRAM_ID` and `ORACLE_LST_ID` are public. No private key is required for the API because it is read-only.

## Deploy on Vercel

1. Import the repo into Vercel.
2. Set the project root to `dashboard`.
3. Add the environment variables above.
4. Use the default Vercel build command:

```bash
npm run build
```

5. Deploy.

## Before each demo deploy

Refresh the snapshot artifacts so the static fallback stays current:

```bash
npm run sync:data
npm run build
```

## Routes

- `/` narrative landing page
- `/app` live oracle dashboard
- `/sim` historical replay view
- `/api/oracle-state` live PDA reader
- `/api/simulation` simulation snapshot API
