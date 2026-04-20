# PegShield

[![Oracle Updater](https://github.com/Fianko-codes/PegShield/actions/workflows/oracle-updater.yml/badge.svg)](https://github.com/Fianko-codes/PegShield/actions/workflows/oracle-updater.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

Solana-native **risk oracle** for LST collateral.

PegShield does **not** answer "what is this token worth?"  
PegShield answers **"how much should a lender safely lend against this collateral right now?"**

## Thesis

> Fixed collateral factors are too slow for LST stress events.
>
> PegShield continuously measures **peg risk**, calibrates a statistical model over that signal, and publishes a live on-chain **suggested LTV** that a lending protocol can enforce immediately.

## The Problem

Static LTV policy assumes peg stability.

| During stress | Static collateral factor does | Why that fails |
|---|---|---|
| LST starts trading below intrinsic staking rate | nothing | governance reacts too slowly |
| Liquidity thins out | nothing | liquidation routes degrade exactly when needed most |
| Regime breaks from mean-reverting to unstable | nothing | protocols keep lending as if conditions are normal |
| Oracle becomes stale | often unclear fallback behavior | lenders accidentally accept blind risk |

## What PegShield Changes

| Layer | PegShield output | Consumer action |
|---|---|---|
| Market ingestion | peg deviation vs canonical staking rate | stop confusing yield accrual with de-peg risk |
| Statistical engine | `theta`, `sigma`, `z_score`, regime | classify whether the peg still behaves normally |
| On-chain state | `suggested_ltv_bps`, `regime_flag`, freshness | gate new borrows immediately |
| SDK guardrail | `safeLtv()` | degrade safely on staleness or critical regime |

## Figure: End-to-End System

```text
┌──────────────┐   ┌──────────┐   ┌───────────────┐   ┌──────────┐   ┌────────────┐
│  Pyth Hermes │ → │  bridge  │ → │ core-engine   │ → │ updater  │ → │ Solana PDA │ → lenders
│  (LST/SOL)   │   │ + rates  │   │ OU + ADF +    │   │ signed   │   │ risk_state │
│              │   │          │   │ z + LTV map   │   │ submit   │   │  by lst_id │
└──────────────┘   └──────────┘   └───────────────┘   └──────────┘   └────────────┘
       ▲                  ▲
       │                  │
       │         Marinade / Jito / SolBlaze reference rate
       │
       └──────────── live market price feeds
```

## Figure: Consumer Decision Flow

```text
            read RiskState PDA
                    │
                    ▼
        is owner correct / account present?
                    │
          no ───────┴──────► use conservative fallback LTV
                    │ yes
                    ▼
              is data stale?
                    │
          yes ──────┴──────► use conservative fallback LTV
                    │ no
                    ▼
          is regime_flag == CRITICAL?
                    │
          yes ──────┴──────► tighten hard or halt new borrows
                    │ no
                    ▼
             apply suggested_ltv_bps
```

## Why This Is Not Just Another Price Oracle

PegShield measures **peg deviation**, not raw USD premium:

```text
peg_deviation = (asset_usd / sol_usd) / reference_rate - 1
```

That matters because LSTs naturally drift upward versus `SOL` in USD terms as staking yield accrues. A naive USD spread overstates risk. PegShield instead compares market price against the LST's **canonical staking exchange rate**.

Current reference-rate sources:

| Asset | `lst_id` | Reference rate source |
|---|---|---|
| Marinade Staked SOL | `mSOL-v2` | Marinade API |
| Jito Staked SOL | `jitoSOL-v1` | Jito stake-pool stats |
| BlazeStake SOL | `bSOL-v1` | SolBlaze stake-pool account via Solana RPC |

## Proof That Exists Today

| Category | What is live or committed today |
|---|---|
| On-chain program | Anchor program deployed on Solana devnet |
| On-chain output | `RiskState` PDA storing live LTV + regime + freshness |
| Multi-asset scope | `mSOL-v2`, `jitoSOL-v1`, `bSOL-v1` supported through the bridge/engine path |
| Operator surface | unified `pegshield` CLI for init / read / propose / confirm / dispute flows |
| Consumer surface | `@pegshield/sdk` with `fetchRiskState`, `isStale`, `isCritical`, `safeLtv` |
| On-chain integration proof | `mock-lender` Anchor program that reads PegShield and records borrow decisions |
| CI loop | scheduled GitHub Actions updater |
| Historical proof | replay of June 2022 `stETH/ETH` depeg |
| Scenario breadth | 1 historical + 8 synthetic / scenario-lab stress paths |
| Offline reproducibility | committed `artifacts/` snapshots and bridge caches |

## Live Deployment (Devnet)

| Artifact | Address | Explorer |
|---|---|---|
| Program | `DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea` | [view](https://explorer.solana.com/address/DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea?cluster=devnet) |
| Risk State PDA (`mSOL-v2`) | `7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo` | [view](https://explorer.solana.com/address/7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo?cluster=devnet) |
| Updater Authority | `4kEmLqMqb3PGsmBC8brARQ5sKzUv37PjdSereu1yoNyc` | [view](https://explorer.solana.com/address/4kEmLqMqb3PGsmBC8brARQ5sKzUv37PjdSereu1yoNyc?cluster=devnet) |

The updater is driven by [`.github/workflows/oracle-updater.yml`](./.github/workflows/oracle-updater.yml).

## Figure: What Lives On-Chain

`RiskState` PDA, seeded by `["risk", lst_id]`.

| Field | Type | Meaning |
|---|---|---|
| `theta_scaled` | `i64` | mean-reversion speed × `1_000_000` |
| `sigma_scaled` | `i64` | volatility × `1_000_000` |
| `z_score_scaled` | `i64` | signed z-score × `1_000_000` |
| `suggested_ltv_bps` | `u16` | live LTV in basis points |
| `regime_flag` | `u8` | `0 = NORMAL`, `1 = CRITICAL` |
| `slot`, `timestamp` | `u64`, `i64` | freshness and observability |
| `authority` | `Pubkey` | only writer |
| `last_updater` | `Pubkey` | most recent submitter |

## Statistical Core

PegShield fits an Ornstein-Uhlenbeck process over the rolling peg-deviation window:

```text
dX_t = θ (μ - X_t) dt + σ dW_t
```

Interpretation:

| Symbol | Meaning | Why lenders care |
|---|---|---|
| `θ` | mean-reversion speed | slower snapback means weaker peg quality |
| `μ` | long-run mean | tells you where the process wants to settle |
| `σ` | volatility | higher volatility means less stable collateral |
| `z_score` | distance from rolling mean | measures how abnormal current conditions are |
| ADF stationarity test | checks regime stability | helps distinguish noise from structural break |

The engine converts that into a regime flag and a suggested LTV. In `CRITICAL` regime, the recommended LTV tightens aggressively.

## Why Judges Should Care

| Question | PegShield answer |
|---|---|
| Is this actually on-chain? | Yes, program + PDA are live on devnet |
| Is this just theory? | No, the repo includes historical replay and a runnable end-to-end demo |
| Can a protocol integrate quickly? | Yes, via `@pegshield/sdk` or direct PDA reads |
| Does it generalize beyond one asset? | Yes, bridge path supports `mSOL`, `jitoSOL`, `bSOL` |
| Does it fail safely? | Yes, consumers are expected to fall back conservatively on staleness or critical regime |

## Repo Structure

| Path | Role |
|---|---|
| [`bridge/`](./bridge) | fetches Pyth prices and reference rates, writes peg-deviation series |
| [`core-engine/`](./core-engine) | OU calibration, ADF regime detection, LTV mapping |
| [`solana-program/`](./solana-program) | Anchor programs for `RiskState` and the mock lender consumer |
| [`updater/`](./updater) | initialize / submit / read / close / consumer demo scripts |
| [`cli/`](./cli) | unified `pegshield` operator CLI |
| [`sdk/`](./sdk) | typed TS client for integrators |
| [`simulation/`](./simulation) | historical and synthetic stress replays |
| [`artifacts/`](./artifacts) | committed oracle snapshots, bridge caches, scenario bundle |
| [`scripts/`](./scripts) | artifact sync and operator utilities |
| [`docs/`](./docs) | architecture, integration, and trust-model docs |
| [`tests/`](./tests) | engine micro-tests |

## Fastest Evaluation Path

If someone wants to judge the project in under five minutes:

| Step | Command | What it proves |
|---|---|---|
| 1 | `./demo.sh --dry-run` | the operational flow is coherent |
| 2 | `.venv/bin/python -m unittest tests.test_core_engine -v` | the statistical core is tested |
| 3 | `npm --prefix cli run start -- read mSOL-v2` | the unified operator CLI can read the live devnet PDA |
| 4 | `.venv/bin/python simulation/stress_test.py` | the stress replay is reproducible |
| 5 | `cd examples/lending-borrow-demo && npm install && npm run start -- 100 1814.63 stETH` | an external lender can consume it |

## One-Command Demo

```bash
./demo.sh
```

That flow:

1. verifies the engine tests
2. fetches live bridge data
3. runs the statistical engine
4. submits the update on devnet
5. reads the PDA back through the SDK
6. replays the real June 2022 `stETH/ETH` event
7. refreshes repo-level oracle artifacts

Use `./demo.sh --dry-run` if you want to verify the path without touching devnet.

## Full Local Flow

```bash
.venv/bin/python -m unittest tests.test_core_engine -v
.venv/bin/python bridge/fetch_pyth.py
.venv/bin/python core-engine/pipeline.py
npm --prefix cli run start -- status mSOL-v2
npm --prefix updater run submit
npm --prefix cli run start -- read mSOL-v2
.venv/bin/python simulation/stress_test.py
npm --prefix updater run consumer -- 1000 mSOL-v2
```

To submit multiple prepared payloads in one pass:

```bash
npm --prefix updater run submit -- ./core-engine/output/latest.mSOL-v2.json ./core-engine/output/latest.jitoSOL-v1.json
npm --prefix updater run submit -- --all
```

## Consumer Integration

Minimal integration through [`@pegshield/sdk`](./sdk):

```ts
import { Connection } from "@solana/web3.js";
import { fetchRiskState, safeLtv } from "@pegshield/sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const { state } = await fetchRiskState(connection, { lstId: "mSOL-v2" });
const ltv = safeLtv(state, { fallbackLtv: 0.4, maxLtv: 0.85 });
```

Read more:

- [`docs/INTEGRATION.md`](./docs/INTEGRATION.md)
- [`sdk/README.md`](./sdk/README.md)
- [`examples/lending-borrow-demo`](./examples/lending-borrow-demo)

## CI / Operator Path

The scheduled updater in [`.github/workflows/oracle-updater.yml`](./.github/workflows/oracle-updater.yml):

| Step | Behavior |
|---|---|
| test | runs engine micro-tests |
| bridge | fetches live prices + reference rates |
| engine | calibrates OU parameters and risk regime |
| cache | writes bridge caches and oracle artifacts to `artifacts/` |
| safety gate | skips on-chain submit when history source is fallback |
| submit | updates configured PDAs when history is trusted |

Required secrets:

| Secret | Purpose |
|---|---|
| `SOLANA_RPC_URL` | devnet RPC endpoint |
| `SOLANA_MAINNET_RPC_URL` | optional mainnet RPC for SolBlaze account reads |
| `PROGRAM_ID` | PegShield program id |
| `PYTH_HTTP_URL` | Hermes endpoint |
| `ORACLE_AUTHORITY` | updater pubkey |
| `UPDATER_KEYPAIR_JSON` | updater keypair contents |
| `MSOL_RISK_STATE_PDA` | devnet PDA for `mSOL-v2` |
| `JITOSOL_RISK_STATE_PDA` | devnet PDA for `jitoSOL-v1` |
| `BSOL_RISK_STATE_PDA` | devnet PDA for `bSOL-v1` |

## Stress Evidence

The repo carries both:

- a **real** historical replay: June 2022 `stETH/ETH`
- **synthetic** scenarios that stress different failure shapes

Current bundle in [`artifacts/stress_scenario.json`](./artifacts/stress_scenario.json):

| Scenario | Kind | What it tests |
|---|---|---|
| `steth_june_2022` | Historical | real de-peg credibility fixture |
| `liquidity_vacuum` | Synthetic | fast gap-down and shallow rebound |
| `reflexive_bank_run` | Synthetic | two-leg selloff with false recovery |
| `slow_grind_depeg` | Synthetic | creeping impairment |
| `false_positive_wick` | Synthetic | recovery after one-off shock |
| `flash_crash_repricing` | Synthetic | fast dislocation then snapback |

Simulation outputs:

```bash
.venv/bin/python simulation/stress_test.py
```

This writes:

- `simulation/charts/stress_scenario.csv`
- `simulation/charts/stress_scenario.png`
- `simulation/charts/stress_scenario.meta.json`

## Current Status

### Working today

- live Pyth ingestion + protocol-specific reference-rate normalization
- multi-LST bridge support for `mSOL-v2`, `jitoSOL-v1`, `bSOL-v1`
- OU estimator, ADF stationarity test, z-score regime detector
- deployed Anchor program with fixed-point risk state
- devnet PDA updates, reads, and rate-limiting
- committed oracle artifacts and bridge caches for replay / fallback
- six-scenario stress bundle
- typed SDK and runnable lender example

### Not production-ready

- single-attester trust model
- devnet only
- no production lender integration yet
- no decentralized updater committee yet
- no operational alerting or mainnet deployment process yet

## Local Setup

```bash
python -m venv .venv
.venv/bin/pip install numpy pandas scipy statsmodels requests matplotlib
npm --prefix updater install
npm --prefix solana-program install
(cd solana-program && anchor build)
```

Copy `.env.example` to `.env` and fill:

```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea
UPDATER_KEYPAIR_PATH=./updater/keypair.json
PYTH_HTTP_URL=https://hermes.pyth.network
ORACLE_AUTHORITY=<pubkey of the updater keypair>
LST_ASSET=mSOL
LST_ID=mSOL-v2
MSOL_RISK_STATE_PDA=7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo
# Optional:
# LST_ASSET=jitoSOL
# LST_ID=jitoSOL-v1
# JITOSOL_RISK_STATE_PDA=<pubkey>
# LST_ASSET=bSOL
# LST_ID=bSOL-v1
# BSOL_RISK_STATE_PDA=<pubkey>
```

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system design, data contracts, failure modes
- [`docs/INTEGRATION.md`](./docs/INTEGRATION.md) — lender integration path
- [`sdk/README.md`](./sdk/README.md) — SDK API reference
- [`SECURITY.md`](./SECURITY.md) — trust model and disclosure process
- [`docs/MULTI_ATTESTER.md`](./docs/MULTI_ATTESTER.md) — roadmap away from single-signer trust

## Safety Before Pushing

```bash
git status --short
git ls-files | rg 'keypair|\.env|latest_raw|latest\.json|stress_scenario|\.mplcache|\.codex'
```

Neither command should expose secrets or local-only operational files.

## License

[Apache-2.0](./LICENSE). Created by [@Fianko-codes](https://github.com/Fianko-codes).
