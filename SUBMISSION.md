# PegShield Submission Guide

This is the judge-facing path: a clear thesis, runnable proof, operator tooling, integration proof, and explicit risk disclosure.

## One-Line Pitch

PegShield is a Solana-native risk oracle for LST collateral. Price oracles answer what an asset is worth; PegShield answers how much a lender should safely lend against it right now.

## What To Evaluate First

| Time | Command | What it proves |
|---|---|---|
| 30 sec | `make verify-offline` | engine tests, SDK tests, CLI build, Rust compile, demo wiring, artifacts |
| 20 sec | `./demo.sh --dry-run` | the seven-step demo path is coherent without touching devnet |
| 30 sec | `npm --prefix cli run start -- read mSOL-v2` | operator CLI can read the live devnet oracle |
| 30 sec | `.venv/bin/python simulation/stress_test.py` | historical depeg replay is reproducible |

For a live write demo, use `make demo` after `.env` and `updater/keypair.json` are configured.

## Submission Evidence

| Submission signal | PegShield evidence |
|---|---|
| Clear protocol surface | [`README.md`](./README.md), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/INTEGRATION.md`](./docs/INTEGRATION.md) |
| On-chain depth | Anchor `risk_oracle` program with `RiskState`, registry, pending update, dispute records |
| Operator tooling | [`cli/`](./cli), [`updater/`](./updater), root [`Makefile`](./Makefile) |
| Consumer proof | [`solana-program/programs/mock-lender`](./solana-program/programs/mock-lender), [`examples/lending-borrow-demo`](./examples/lending-borrow-demo) |
| Reproducible proof | [`artifacts/`](./artifacts), [`simulation/`](./simulation), `make verify-offline` |
| Deployment discipline | [`DEPLOY.md`](./DEPLOY.md), [`.github/workflows/ci.yml`](./.github/workflows/ci.yml), [`.github/workflows/oracle-updater.yml`](./.github/workflows/oracle-updater.yml) |
| Honest risk model | [`SECURITY.md`](./SECURITY.md), [`docs/MULTI_ATTESTER.md`](./docs/MULTI_ATTESTER.md) |

## Technical Differentiator

PegShield normalizes LST market price against the canonical staking exchange rate:

```text
peg_deviation = (asset_usd / sol_usd) / reference_rate - 1
```

That avoids punishing normal LST exchange-rate accrual and focuses on actual peg stress. The engine then fits OU parameters, checks stationarity, computes a z-score, and maps the result to an on-chain LTV recommendation.

## Business Case

### Market

Solana LSTs represent multi-billion dollars of on-chain collateral. Jito alone ([stake-pool stats](https://www.jito.network/stats/)) exceeds $3B in deposits; Marinade mSOL and BlazeStake bSOL add further billions. A meaningful fraction — **conservatively $1–3B on Solana today** — flows into lending markets (Kamino, marginfi, Save, Drift) as collateral. Every dollar of that collateral is currently gated by a **static, governance-set LTV table** that nobody updates when a peg starts slipping. That is the exact market PegShield addresses.

The problem generalizes beyond Solana: every chain with LSTs (Ethereum, EigenLayer restaking, Aptos, Sei) has the same structural gap between price oracles and live collateral policy. Solana is the wedge.

### Revenue Model

Two complementary paths, both sustainable on-chain:

| Path | How it works | Who pays | Attester share |
|---|---|---|---|
| **Per-loan fee** | Lending protocol pays `N` bps of loan notional at origination when the loan was gated by a PegShield read | The lending protocol (absorbs from borrower or eats from spread) | 50% of fees to attester pool, 50% to protocol treasury |
| **Subscription / SLA tier** | Protocols subscribe for guaranteed feed SLA, priority lanes, custom LSTs, historical data | The lending protocol, flat monthly | Same split |

Slashing (50% of bond on proven bad update) creates a second pressure on the attester pool, deflating bad actors and compensating good ones. Revenue flows: protocol → treasury + attester pool → honest attesters.

Illustrative back-of-envelope at 5 bps of originations on $2B LST-backed lending TVL with ~2× annual churn: **~$2M ARR on Solana alone**. Scaling the same model across Ethereum LSTs ($30B+ market) is the natural expansion path.

### Competitive Positioning

PegShield is **not** competing with price oracles. It consumes them.

| | Pyth | Switchboard | Chaos Labs / Gauntlet | Protocol-internal LTV tables | PegShield |
|---|---|---|---|---|---|
| Publishes | Prices | Prices + custom feeds | Risk recommendations (off-chain reports) | Hardcoded collateral factors | **Live LTV + regime flag** |
| On-chain output | Yes | Yes | No | N/A (hardcoded constants) | Yes |
| Real-time | Yes (sub-second) | Yes | No (governance cycle, weeks) | No (governance, months) | Yes (30-second cadence) |
| Crypto-economic security | Pull + staked publishers | Staked feed operators | None (SaaS) | N/A | Bonded attesters + slashing |
| Answers "what is it worth" | ✅ | ✅ | ❌ | ❌ | ❌ (reads from Pyth) |
| Answers "how much to lend" | ❌ | ❌ | ✅ (offline, stale) | ✅ (very stale) | ✅ (live, on-chain) |

In one sentence: **Pyth and Switchboard price assets. Chaos and Gauntlet advise protocols. PegShield enforces collateral policy, on-chain and in real time.**

## Demo Storyboard

1. Show `README.md` thesis: risk oracle, not price oracle.
2. Run `make verify-offline`.
3. Run `npm --prefix cli run start -- status mSOL-v2` or `read mSOL-v2`.
4. Show `artifacts/stress_scenario.json` and the June 2022 replay output.
5. Show `mock-lender` rejecting unsafe borrows using PegShield state.
6. Close on the multi-attester path: bonded attesters, threshold confirm, dispute, slash.

## Submission Readiness Checklist

- [x] Core engine tests pass in the project virtualenv.
- [x] SDK guard and decoder tests pass.
- [x] CLI builds from TypeScript.
- [x] Rust programs compile with `cargo check`.
- [x] Dry-run demo wiring passes.
- [x] Three LST artifacts are committed: `mSOL-v2`, `jitoSOL-v1`, `bSOL-v1`.
- [x] Mock lender consumer exists in the Anchor workspace.
- [ ] Live demo has been timed under 90 seconds on the submitter machine.
- [ ] Demo video has been recorded and uploaded.

## Known Caveats

The devnet deployment is mutable and should be treated as a hackathon proof, not production infrastructure. The code includes multi-attester state and flows, but operators still need production key custody, monitoring, and mainnet deployment discipline before real lending markets should depend on it.
