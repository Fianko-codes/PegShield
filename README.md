# PegShield

[![Oracle Updater](https://github.com/Fianko-codes/PegShield/actions/workflows/oracle-updater.yml/badge.svg)](https://github.com/Fianko-codes/PegShield/actions/workflows/oracle-updater.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

Risk oracle, not price oracle. For Solana LSTs as collateral.

PegShield is a Solana-native **risk oracle** for liquid staking token (LST) collateral. It publishes a live, statistically calibrated LTV that tightens automatically when an LST starts de-pegging, instead of leaving lenders with a fixed collateral factor and hoping liquidations keep up.

The live devnet deployment currently serves `mSOL-v2`, and the bridge/engine path now also supports `jitoSOL-v1` so the repo demonstrates multi-LST generalization instead of a single hard-coded asset.

> **Price oracles answer:** what is this asset worth?
> **PegShield answers:** how safe is this asset to use as collateral *right now*?

---

## Live Deployment (Solana Devnet)

| Artifact | Address | Explorer |
|---|---|---|
| Program | `DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea` | [view](https://explorer.solana.com/address/DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea?cluster=devnet) |
| Risk State PDA (`mSOL-v2`) | `7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo` | [view](https://explorer.solana.com/address/7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo?cluster=devnet) |
| Updater Authority | `4kEmLqMqb3PGsmBC8brARQ5sKzUv37PjdSereu1yoNyc` | [view](https://explorer.solana.com/address/4kEmLqMqb3PGsmBC8brARQ5sKzUv37PjdSereu1yoNyc?cluster=devnet) |
| Dashboard | [pegshield.anubhavprasai.com.np](https://pegshield.anubhavprasai.com.np/) | — |
| Live oracle API | `https://pegshield.anubhavprasai.com.np/api/oracle-state` | — |
| Live market API | `https://pegshield.anubhavprasai.com.np/api/market-state` | — |

The PDA is updated on a cron by [`oracle-updater.yml`](./.github/workflows/oracle-updater.yml).

---

## How It Works

```
┌──────────────┐   ┌──────────┐   ┌───────────────┐   ┌──────────┐   ┌────────────┐
│  Pyth Hermes │ → │  bridge  │ → │ core-engine   │ → │ updater  │ → │ Solana PDA │ → consumers
│  (LST/SOL)   │   │  + rate  │   │ OU + regime   │   │ submit   │   │ risk_state │
└──────────────┘   └──────────┘   └───────────────┘   └──────────┘   └────────────┘
                Marinade / Jito API  (stat risk)         (authority)    (Anchor)
```

### Signal: peg deviation, not USD premium

Naively comparing an LST and `SOL` in USD gives a large "spread" that is mostly accrued staking yield, not risk. PegShield measures **peg deviation** against the protocol's canonical staking exchange rate:

```
peg_deviation = (asset_usd / sol_usd) / reference_rate − 1
```

A healthy peg sits near zero and mean-reverts. A real de-peg drives it meaningfully negative. This is the series the OU model calibrates against.

Today that reference-rate source is:
- Marinade API for `mSOL-v2`
- Jito stake-pool stats API for `jitoSOL-v1`

### Statistical model

An **Ornstein–Uhlenbeck** process over the rolling peg-deviation window:

```
dX_t = θ (μ − X_t) dt + σ dW_t
```

- `θ` — mean-reversion speed (how quickly peg snaps back)
- `σ` — volatility
- An ADF stationarity test + z-score ≥ 2.5σ flags a `CRITICAL` regime
- In `CRITICAL` regime, the suggested LTV is aggressively reduced

The LTV output is clamped to `[MIN_LTV_BPS, MAX_LTV_BPS]` by the on-chain program.

### On-chain layout

`RiskState` PDA, seeded `["risk", lst_id]`, stores fixed-point integers (no floats on-chain):

| Field | Type | Meaning |
|---|---|---|
| `theta_scaled` | `i64` | θ × 1,000,000 |
| `sigma_scaled` | `i64` | σ × 1,000,000 |
| `z_score_scaled` | `i64` | z × 1,000,000 (signed) |
| `suggested_ltv_bps` | `u16` | LTV in basis points, 0–10,000 |
| `regime_flag` | `u8` | 0=NORMAL, 1=CRITICAL |
| `slot`, `timestamp` | `u64`, `i64` | freshness |
| `authority` | `pubkey` | only signer allowed to update |
| `last_updater` | `pubkey` | who submitted most recent update |

Rate-limited to one update per 30 seconds; `has_one = authority` gates `update_risk_state` and `close_oracle`.

---

## Repository Layout

```
bridge/         Fetches Pyth prices + protocol reference rate, writes peg_deviation
core-engine/    OU estimator, ADF regime detector, LTV calculator
solana-program/ Anchor program (risk_oracle)
sdk/            @pegshield/sdk — typed TypeScript client for consumers
updater/        init / submit / read / close / consumer-demo scripts
simulation/     Historical replay + synthetic fallback (oracle vs fixed-LTV)
dashboard/      Vite + React dashboard and read-only Vercel API
docs/           Design notes and architecture roadmap documents
tests/          Python micro-tests for the statistical engine
```

## Consumer SDK

A lending protocol can integrate against the oracle in a few lines using [`@pegshield/sdk`](./sdk):

```ts
import { Connection } from "@solana/web3.js";
import { fetchRiskState, safeLtv } from "@pegshield/sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const { state } = await fetchRiskState(connection); // defaults to mSOL-v2 on devnet
const ltv = safeLtv(state); // falls back to 0.4 when stale or CRITICAL
```

Full docs, guards, and types: [`sdk/README.md`](./sdk/README.md).

## Local Setup

```bash
# Python engine
python -m venv .venv
.venv/bin/pip install numpy pandas scipy statsmodels requests matplotlib

# Updater (Node)
npm --prefix updater install

# Solana program
npm --prefix solana-program install
(cd solana-program && anchor build)
```

Copy `.env.example` to `.env` and fill in:

```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea
UPDATER_KEYPAIR_PATH=./updater/keypair.json
PYTH_HTTP_URL=https://hermes.pyth.network
ORACLE_AUTHORITY=<pubkey of the updater keypair>
LST_ASSET=mSOL
LST_ID=mSOL-v2
MSOL_RISK_STATE_PDA=7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo
# Optional second asset path:
# LST_ASSET=jitoSOL
# LST_ID=jitoSOL-v1
# JITOSOL_RISK_STATE_PDA=<your jitoSOL PDA once initialized>
```

## Run The 60-Second Demo

For anyone evaluating the project end-to-end, the fastest path is the one-command demo:

```bash
./demo.sh
```

This runs the engine tests, fetches live bridge data, computes the fresh risk payload, submits it on devnet, reads the PDA back through `@pegshield/sdk`, replays the real June 2022 `stETH/ETH` depeg, and refreshes the dashboard snapshot. Use `./demo.sh --dry-run` to verify the command path and local prerequisites without touching devnet.

## Run The Full Flow

```bash
.venv/bin/python -m unittest tests.test_core_engine -v     # 1. verify engine
.venv/bin/python bridge/fetch_pyth.py                      # 2. fetch live data for the configured LST
.venv/bin/python core-engine/pipeline.py                   # 3. run statistical engine
npm --prefix updater run submit                            # 4. push on-chain
npm --prefix updater run read -- mSOL-v2                   # 5. read PDA back
.venv/bin/python simulation/stress_test.py                 # 6. historical replay
npm --prefix updater run consumer -- 1000 mSOL-v2          # 7. borrow-limit comparison
```

The consumer demo prints the max borrow allowed under a fixed-80% policy vs. the live oracle LTV for a sample collateral amount, plus a staleness warning if the last update is older than 10 minutes. To run the second asset path, switch `LST_ASSET=jitoSOL`, `LST_ID=jitoSOL-v1`, initialize a second PDA, then rerun the same commands.

## GitHub Actions Updater

[`.github/workflows/oracle-updater.yml`](./.github/workflows/oracle-updater.yml) runs on a schedule and:

1. Runs the micro tests
2. Fetches live Pyth data + the configured LST reference rate
3. Runs the statistical engine
4. Submits a fresh update to the configured `lst_id` PDA
5. Regenerates `dashboard/public/data/*.json`
6. Commits the snapshot back so Vercel redeploys

**Required repo secrets:**

| Secret | Purpose |
|---|---|
| `SOLANA_RPC_URL` | Devnet RPC endpoint |
| `PROGRAM_ID` | `DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea` |
| `PYTH_HTTP_URL` | `https://hermes.pyth.network` |
| `ORACLE_AUTHORITY` | Updater pubkey (must match keypair below) |
| `UPDATER_KEYPAIR_JSON` | Full contents of `updater/keypair.json` (JSON array) |

## Simulation

Writes `simulation/charts/stress_scenario.{csv,png}` plus `stress_scenario.meta.json` — by default a replay of the June 2022 `stETH/ETH` depeg so judges can see how PegShield would have reacted to a real event. Each row includes `peg_deviation`, `theta`, `sigma`, `z_score`, `regime_flag`, and bad-debt estimates under both policies. Pass `--mode synthetic` to fall back to the old generated path.

## Status

**Working today:**
- Live Pyth ingestion + Marinade-rate-corrected peg signal
- Second asset path wired for `jitoSOL-v1` with Jito stake-pool reference-rate support
- OU estimator, ADF stationarity test, z-score regime detector
- Deployed Anchor program with fixed-point `i64`/`u16` layout
- On-chain PDA updates, reads, and rate-limiting
- Authority-gated `close_oracle` instruction (layout-migration safe)
- Stress replay + live dashboard

**Not production-ready:**
- Single-attester trust model (decentralized updater set is roadmap)
- Devnet only; no mainnet deployment
- Long-horizon calibration baselines are bootstrapped, not historically trained
- No protocol-side consumer integration yet (SDK is the next deliverable)
- No operational alerting

## Safety Before Publishing

`.gitignore` keeps secrets and generated artifacts out. Before `git push`:

```bash
git status --short
git ls-files | rg 'keypair|\.env|latest_raw|latest\.json|stress_scenario|\.mplcache|\.codex'
```

Neither should show any secrets or local operational files.

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system diagram, components, update sequence, data contracts, failure modes
- [`docs/INTEGRATION.md`](./docs/INTEGRATION.md) — step-by-step lender integration walkthrough using `@pegshield/sdk`
- [`sdk/README.md`](./sdk/README.md) — SDK API reference + consumer safety checklist
- [`SECURITY.md`](./SECURITY.md) — trust model, on-chain safety properties, responsible disclosure
- [`docs/MULTI_ATTESTER.md`](./docs/MULTI_ATTESTER.md) — roadmap away from single-signer trust

## Security

See [SECURITY.md](./SECURITY.md) for the trust model, on-chain safety properties, consumer responsibilities, and responsible-disclosure process.

The roadmap away from single-signer trust is documented in [docs/MULTI_ATTESTER.md](./docs/MULTI_ATTESTER.md).

## License

[Apache-2.0](./LICENSE). Created by [@Fianko-codes](https://github.com/Fianko-codes).
