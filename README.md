# PegShield

[![Oracle Updater](https://github.com/Fianko-codes/PegShield/actions/workflows/oracle-updater.yml/badge.svg)](https://github.com/Fianko-codes/PegShield/actions/workflows/oracle-updater.yml)
[![CI](https://github.com/Fianko-codes/PegShield/actions/workflows/ci.yml/badge.svg)](https://github.com/Fianko-codes/PegShield/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

Solana-native **collateral circuit breaker** for LST lending.

PegShield does not answer "what is this token worth?" It answers **"should a lender keep extending credit against this collateral right now, and at what LTV?"**

## Thesis

> Fixed collateral factors are too slow for LST stress events.
>
> PegShield continuously measures **peg risk**, calibrates a statistical model over that signal, and publishes a live on-chain **suggested LTV** that a lending protocol can enforce immediately.

Solana LSTs represent multi-billion dollars of on-chain collateral today, and every dollar of it is still gated by static, governance-set LTV tables. PegShield replaces those tables with live, bonded, slashable risk state. Market, revenue model, and competitive positioning are in [`SUBMISSION.md`](./SUBMISSION.md#business-case).

## Frontier Judge Proof

The fastest way to understand PegShield is not another oracle read. It is the borrow gate:

```bash
make frontier-proof
```

That command prints a deterministic proof from committed artifacts:

```text
static 80% LTV table       -> same borrow is ALLOW
PegShield stress LTV       -> same borrow is REJECT
result                     -> new credit removed before static shortfall
```

This is the primitive: a Solana PDA that turns market stress into an enforceable collateral circuit breaker. Pyth tells a lender what the LST is worth; PegShield tells the lender whether to keep extending credit against it.

## What's Different From a Price Oracle

PegShield measures **peg deviation**, not raw USD premium:

```text
peg_deviation = (asset_usd / sol_usd) / reference_rate - 1
```

LSTs naturally drift upward versus `SOL` in USD terms as staking yield accrues. A naive USD spread overstates risk. PegShield compares market price against each LST's canonical staking exchange rate.

| Asset | `lst_id` | Reference rate source |
|---|---|---|
| Marinade Staked SOL | `mSOL-v2` | Marinade API |
| Jito Staked SOL | `jitoSOL-v1` | Jito stake-pool stats |
| BlazeStake SOL | `bSOL-v1` | SolBlaze stake-pool account via Solana RPC |

## End-to-End System

```text
┌──────────────┐   ┌──────────┐   ┌───────────────┐   ┌──────────┐   ┌────────────┐
│  Pyth Hermes │ → │  bridge  │ → │ core-engine   │ → │ updater  │ → │ Solana PDA │ → lenders
│  (LST/SOL)   │   │ + rates  │   │ OU + ADF +    │   │ signed   │   │ risk_state │
│              │   │          │   │ z + LTV map   │   │ submit   │   │  by lst_id │
└──────────────┘   └──────────┘   └───────────────┘   └──────────┘   └────────────┘
       ▲
       │
       └──────────── Marinade / Jito / SolBlaze reference rates
```

The off-chain pipeline fits an Ornstein-Uhlenbeck process over the rolling peg-deviation window, runs an ADF stationarity test, and maps regime + z-score to an on-chain LTV recommendation. In `CRITICAL` regime, the recommended LTV tightens aggressively. Full model and failure-mode details: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Live Deployment (Devnet)

| Artifact | Address |
|---|---|
| Program | [`DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea`](https://explorer.solana.com/address/DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea?cluster=devnet) |
| Risk State PDA (`mSOL-v2`) | [`7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo`](https://explorer.solana.com/address/7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo?cluster=devnet) |
| Updater Authority | [`4kEmLqMqb3PGsmBC8brARQ5sKzUv37PjdSereu1yoNyc`](https://explorer.solana.com/address/4kEmLqMqb3PGsmBC8brARQ5sKzUv37PjdSereu1yoNyc?cluster=devnet) |

Last manual devnet refresh: April 24, 2026, transaction [`5cq1vDvEyfAyjsafW2TVAbGHAb8vyLHSoGrJWnQLLZy3K5KsmWBv2qfSwLnKoMKJJM8EcTuxGDwuAvz6teSmtMqy`](https://explorer.solana.com/tx/5cq1vDvEyfAyjsafW2TVAbGHAb8vyLHSoGrJWnQLLZy3K5KsmWBv2qfSwLnKoMKJJM8EcTuxGDwuAvz6teSmtMqy?cluster=devnet), writing `suggested_ltv_bps = 7321`. The updater runs on [`.github/workflows/oracle-updater.yml`](./.github/workflows/oracle-updater.yml).

## What Lives On-Chain

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

The program ships with a full multi-attester path (`AttesterRegistry`, `PendingUpdate`, `DisputeRecord`): bonded attesters propose and confirm updates, bad updates are disputable, slashed bond goes 50% to the disputer / 50% to the protocol treasury.

## Proof That Exists Today

| Category | What is live or committed |
|---|---|
| On-chain program | Anchor program deployed on Solana devnet |
| On-chain output | `RiskState` PDA storing live LTV + regime + freshness |
| Multi-asset scope | `mSOL-v2`, `jitoSOL-v1`, `bSOL-v1` |
| Source-quality guardrails | LTV haircuts for fallback history, fallback reference rates, missing liquidity depth, and wide Pyth confidence |
| Operator surface | unified `pegshield` CLI for init / read / propose / confirm / dispute flows |
| Consumer surface | `@pegshield/sdk` with `fetchRiskState`, `isStale`, `isCritical`, `safeLtv` |
| On-chain integration proof | PegShield Gate Anchor program that reads PegShield and records policy-driven borrow decisions |
| CI loop | scheduled GitHub Actions updater |
| Historical proof | replay of June 2022 `stETH/ETH` depeg |
| Scenario breadth | 1 historical + 8 synthetic / scenario-lab stress paths |

## Fastest Evaluation Path

Under five minutes:

| Step | Command | What it proves |
|---|---|---|
| 1 | `make frontier-proof` | static LTV allows a borrow that PegShield rejects under stress |
| 2 | `make multi-attester-demo` | 2-of-3 bonded attesters finalize an update into the same consumer PDA |
| 3 | `make scenario-lab` | all historical/synthetic stress scenarios summarized in one table |
| 4 | `make verify-offline` | tests, SDK, CLI build, Rust compile, demo wiring, artifact presence |
| 5 | `./demo.sh --dry-run` | the operational flow is coherent |
| 6 | `npm --prefix cli run start -- read mSOL-v2` | operator CLI reads the live devnet PDA |
| 7 | `.venv/bin/python simulation/stress_test.py` | historical stress replay is reproducible |
| 8 | `cd examples/lending-borrow-demo && npm install && npm run start:snapshot -- 100 1814.63 stETH` | a lender consumes the risk state without live RPC |

To refresh all committed judge artifacts from checked-in bridge caches:

```bash
make artifacts
```

Judge-facing walkthrough: [`SUBMISSION.md`](./SUBMISSION.md). Deployment steps: [`DEPLOY.md`](./DEPLOY.md).

## One-Command Demo

```bash
./demo.sh
```

Runs: engine tests → live bridge fetch → statistical engine → devnet submit → SDK read → June 2022 stETH replay → artifact refresh. Use `--dry-run` to verify wiring without touching devnet.

## Consumer Integration

```ts
import { Connection } from "@solana/web3.js";
import { fetchRiskState, safeLtv } from "@pegshield/sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const { state } = await fetchRiskState(connection, { lstId: "mSOL-v2" });
const ltv = safeLtv(state, { fallbackLtv: 0.4, maxLtv: 0.85 });
```

Consumers are expected to fall back conservatively on staleness or critical regime. Full integration path: [`docs/INTEGRATION.md`](./docs/INTEGRATION.md) and [`sdk/README.md`](./sdk/README.md).

## Repo Structure

| Path | Role |
|---|---|
| [`solana-program/`](./solana-program) | Anchor programs for `RiskState`, multi-attester registry, and PegShield Gate borrow enforcement |
| [`bridge/`](./bridge) | fetches Pyth prices and reference rates, writes peg-deviation series |
| [`core-engine/`](./core-engine) | OU calibration, ADF regime detection, LTV mapping |
| [`updater/`](./updater) | initialize / submit / read / close / consumer demo scripts |
| [`cli/`](./cli) | unified `pegshield` operator CLI |
| [`sdk/`](./sdk) | typed TS client for integrators |
| [`simulation/`](./simulation) | historical and synthetic stress replays |
| [`examples/lending-borrow-demo/`](./examples/lending-borrow-demo) | runnable external consumer |
| [`artifacts/`](./artifacts) | committed oracle snapshots, bridge caches, scenario bundle |
| [`docs/`](./docs) | architecture, integration, and multi-attester design |
| [`tests/`](./tests) | engine micro-tests |

## Operator Status

Read the committed oracle snapshots through the CLI:

```bash
npm --prefix cli run start -- snapshot-status --all
```

This prints current peg deviation, statistical LTV, suggested LTV, liquidity haircut, freshness/source status, regime, and the plain-English reason each LTV moved for every committed LST artifact.

The historical validation write-up lives at [`docs/case-studies/steth-june-2022.md`](./docs/case-studies/steth-june-2022.md) and is generated from [`artifacts/stress_scenario.json`](./artifacts/stress_scenario.json).

## Stress Evidence

The repo carries both a **real** historical replay (June 2022 `stETH/ETH`) and synthetic scenarios. Current bundle in [`artifacts/stress_scenario.json`](./artifacts/stress_scenario.json): `steth_june_2022`, `liquidity_vacuum`, `reflexive_bank_run`, `slow_grind_depeg`, `false_positive_wick`, `flash_crash_repricing`.

```bash
.venv/bin/python simulation/stress_test.py
```

Writes `simulation/charts/stress_scenario.{csv,png,meta.json}`.

For a judge-readable summary across every scenario:

```bash
make scenario-lab
```

## Current Status

**Working today**

- live Pyth ingestion + protocol-specific reference-rate normalization
- multi-LST bridge support for `mSOL-v2`, `jitoSOL-v1`, `bSOL-v1`
- OU estimator, ADF stationarity test, z-score regime detector
- first-class liquidity and data-quality haircuts for missing depth, fallback sources, and wide price confidence
- deployed Anchor program with fixed-point risk state
- multi-attester registry / propose / confirm / dispute / slash flow in code
- deterministic multi-attester proof command for the 2-of-3 finalization path
- devnet PDA updates, reads, and rate-limiting
- typed SDK, unified CLI, runnable lender example, on-chain PegShield Gate
- nine-scenario stress bundle

**Not production-ready**

- devnet only
- independent production attester set is not yet live
- no production lender integration yet; current proof is the reusable integration path
- no operational alerting or mainnet deployment process yet

## Local Setup

```bash
make install        # Python + SDK + CLI + updater + Anchor deps
make verify-offline # all offline checks
```

Or manually:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
npm --prefix sdk install
npm --prefix cli install
npm --prefix updater install
(cd solana-program && anchor build)
```

Copy `.env.example` to `.env` and fill in `SOLANA_RPC_URL`, `PROGRAM_ID`, `UPDATER_KEYPAIR_PATH`, `PYTH_HTTP_URL`, `ORACLE_AUTHORITY`, and the per-LST PDA addresses. Full deployment and secret list: [`DEPLOY.md`](./DEPLOY.md).

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system design, data contracts, failure modes
- [`docs/INTEGRATION.md`](./docs/INTEGRATION.md) — lender integration path
- [`docs/MULTI_ATTESTER.md`](./docs/MULTI_ATTESTER.md) — decentralization design
- [`docs/frontier-submission.html`](./docs/frontier-submission.html) — copy-paste Frontier submission artifact
- [`solana-program/programs/mock-lender/README.md`](./solana-program/programs/mock-lender/README.md) — PegShield Gate borrow-policy module
- [`SUBMISSION.md`](./SUBMISSION.md) — judge-facing proof path
- [`DEPLOY.md`](./DEPLOY.md) — deployment and upgrade runbook
- [`SECURITY.md`](./SECURITY.md) — trust model and disclosure process
- [`sdk/README.md`](./sdk/README.md) — SDK API reference

## License

[Apache-2.0](./LICENSE). Created by [@Fianko-codes](https://github.com/Fianko-codes).
