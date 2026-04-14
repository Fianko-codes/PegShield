# Solana LST Risk Oracle

Solana-native risk oracle for liquid staking token collateral, starting with `mSOL`.

This project ingests live Pyth price data, estimates de-peg risk with a statistical model, and publishes a dynamic collateral signal on Solana devnet for other protocols or clients to consume.

## What It Does

- fetches live `mSOL/USD` and `SOL/USD` price data from Pyth Hermes
- builds a recent historical spread series
- estimates mean reversion and volatility with an Ornstein-Uhlenbeck model
- detects regime stress with Z-score and ADF stationarity checks
- computes a dynamic `suggested_ltv`
- writes the result on-chain through an Anchor program
- reads the risk PDA back from a separate client
- generates a simulation chart comparing fixed LTV vs dynamic oracle LTV

## Why This Exists

Price oracles answer:

> What is this asset worth?

This oracle answers:

> How safe is this asset to use as collateral right now?

That distinction matters for Solana lending protocols that accept LSTs as collateral. Static collateral factors are simple, but they can become dangerous during stress events and de-pegs.

## Current Scope

- one live asset: `mSOL`
- one deployed Solana risk state account per asset
- one updater authority
- devnet only

This is an MVP, not a finished production oracle network.

## Architecture

```text
Pyth Hermes -> bridge -> statistical engine -> updater -> Solana PDA -> consumer
```

### Main Components

- `bridge/`
  Fetches live and recent historical Pyth prices.

- `core-engine/`
  Runs the OU model, regime detection, calibration, and LTV calculation.

- `solana-program/`
  Anchor program that stores the latest risk state on-chain.

- `updater/`
  Initializes the PDA, submits updates, and reads state back.

- `simulation/`
  Generates the stress replay chart and comparison dataset.

- `dashboard/`
  Optional GUI surface for demos.

## Repository Layout

```text
bridge/
core-engine/
dashboard/
simulation/
solana-program/
tests/
updater/
```

## Safety And Publishing Notes

This repo is intended to be safe to publish publicly if you follow these rules:

- do not commit `.env`
- do not commit `updater/keypair.json`
- do not commit generated bridge outputs
- do not commit generated core-engine outputs
- do not commit generated simulation artifacts unless you intentionally want static demo assets in the repo

The root `.gitignore` is configured to keep those local-only files out of version control.

Before making the repo public, verify:

```bash
git status --short
git ls-files | rg 'keypair|\\.env|latest_raw|latest.json|stress_scenario|\\.mplcache|\\.codex'
```

Those commands should not show any secrets or local-only operational artifacts as tracked files.

## Environment

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
```

Required variables:

```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=...
UPDATER_KEYPAIR_PATH=./updater/keypair.json
PYTH_HTTP_URL=https://hermes.pyth.network
ORACLE_AUTHORITY=...
```

## Local Setup

### Python

Use a local virtualenv:

```bash
python -m venv .venv
.venv/bin/pip install numpy pandas scipy statsmodels requests matplotlib
```

### Updater

```bash
cd updater
npm install
cd ..
```

### Solana Program

```bash
cd solana-program
npm install
anchor build
cd ..
```

## Run The Full Flow

From the repo root:

```bash
.venv/bin/python -m unittest tests.test_core_engine -v
.venv/bin/python bridge/fetch_pyth.py
.venv/bin/python core-engine/pipeline.py
npm --prefix updater run submit -- /abs/path/to/core-engine/output/latest.json
npm --prefix updater run read -- mSOL
.venv/bin/python simulation/stress_test.py
```

## Simulation Outputs

The simulation writes:

- `simulation/charts/stress_scenario.csv`
- `simulation/charts/stress_scenario.png`

These are generated artifacts and are ignored by default.

## Product Status

What is currently real:

- live Pyth ingestion
- statistical risk engine
- deployed Solana program
- on-chain PDA updates and reads
- stress simulation

What is not yet production-ready:

- decentralized updater set
- robust long-horizon calibration
- protocol-side consumer integration
- mainnet deployment
- operational monitoring and alerting

## Public Demo Story

The strongest demo sequence is:

1. fetch live Pyth data
2. run the statistical engine
3. submit the update on devnet
4. read the PDA back
5. show the simulation chart

## License

Add a real license file before publishing publicly.
