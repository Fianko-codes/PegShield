# PegShield — Website

The public-facing site for PegShield, the Solana-native collateral circuit breaker
for LST lending. Built with Next.js (App Router) + TypeScript.

It reads the **live `mSOL-v2` RiskState** from Solana devnet through the real
[`@pegshield/sdk`](../sdk), and falls back to a **committed, clearly-labeled offline
snapshot** when devnet RPC is unavailable. All product claims are grounded in the
repository's own artifacts — no fabricated TVL, users, partners, or metrics.

“Live” describes the RPC read, not automatic freshness. The UI separately checks
the account timestamp against the SDK's 10-minute guard and shows the conservative
40% fallback whenever the published value is stale or CRITICAL.

## Run

```bash
# from the repo root, the SDK is auto-built by the web prebuild step
cd web
npm install
npm run dev            # http://localhost:3000
```

Production:

```bash
npm run build && npm run start
```

`predev` / `prebuild` run `scripts/ensure-sdk.mjs` (builds `../sdk` if needed) and
`scripts/build-data.mjs` (derives `data/` from `../artifacts`).

## Data sources & live-vs-fallback

| Surface | Source |
|---|---|
| **Live RiskState card** | `GET /api/riskstate` → `fetchRiskState()` against Solana devnet. On RPC failure/timeout it returns the committed snapshot, labeled *Offline verified snapshot*. |
| **Borrow-decision demo** | Committed artifacts only (deterministic, reliable): the `mSOL-v2` oracle snapshot (Normal) and the `steth_june_2022` replay (Stress). Never presented as live. |
| **Stress lab** | `artifacts/stress_scenario.json` (9 scenarios), derived into `data/stress.json`. |

`scripts/build-data.mjs` is the only place that reads `../artifacts`. Its output in
`data/` is committed so the site builds even without the parent artifacts present.

Override the RPC endpoint (no secret required):

```bash
PEGSHIELD_RPC_URL="https://your-devnet-rpc" npm run start
```

## Checks

```bash
npm run typecheck   # tsc --noEmit (strict)
npm run lint        # ESLint
npm run verify-data # artifact provenance, summaries, and LTV invariants
npm run check       # all three checks above
npm run build       # production build
```

## What this site does **not** touch

No Anchor programs, PDA seeds, account layouts, program IDs, oracle/updater/SDK
behavior, scenario logic, or deployed devnet state are modified. Nothing here
exposes keypairs, secrets, or private environment variables.
