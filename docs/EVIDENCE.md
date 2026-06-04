# Evidence

PegShield is a Solana-native collateral circuit breaker for LST lending protocols. Price oracles tell a protocol what collateral is worth; PegShield tells the protocol whether it should keep extending credit against that collateral, and at what LTV, before governance-set collateral factors can react.

## Reviewer Path

Run these from the repo root:

| Command | Evidence produced |
|---|---|
| `make policy-proof` | Shows a fixed 80% LTV table allowing a borrow that PegShield rejects under stress. |
| `make attester-proof` | Shows the 2-of-3 bonded attester path finalizing a risk update into the same consumer PDA. |
| `make scenario-lab` | Summarizes the historical and synthetic stress suite from committed artifacts. |
| `make verify-offline` | Runs engine tests, SDK tests/build, CLI tests/build, Rust checks, gate tests, oracle-cycle dry-run, and artifact checks. |

Expected high-level result:

```text
static 80% LTV table -> borrow ALLOW
PegShield stress LTV -> borrow REJECT
result               -> new risky credit removed before static shortfall
```

## Live Devnet Surface

| Artifact | Value |
|---|---|
| Network | Solana devnet |
| Program | `DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea` |
| `mSOL-v2` RiskState PDA | `7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo` |
| Updater authority | `4kEmLqMqb3PGsmBC8brARQ5sKzUv37PjdSereu1yoNyc` |
| Last manual refresh | April 24, 2026 |

The devnet PDA stores `suggested_ltv_bps`, `regime_flag`, `timestamp`, slot, and fixed-point risk diagnostics. Lenders can read it directly or through `@pegshield/sdk`.

## Implemented Surfaces

| Surface | Status |
|---|---|
| On-chain `risk_oracle` Anchor program | Implemented and deployed to devnet |
| `RiskState` PDA per LST | Implemented |
| Off-chain bridge | Pyth prices plus canonical LST reference rates |
| Statistical engine | OU calibration, ADF regime detection, z-score, LTV mapping |
| Data-quality haircuts | Fallback history, fallback reference rates, missing liquidity depth, wide Pyth confidence |
| Multi-asset support | `mSOL-v2`, `jitoSOL-v1`, `bSOL-v1` |
| Operator CLI | Init, read, submit, propose, confirm, dispute, scenario proof |
| TypeScript SDK | PDA derivation, decoder, staleness/critical guards, `safeLtv` |
| Borrow-path integration | PegShield Gate Anchor reference program |
| Multi-attester path | Registry, bonded attesters, pending updates, confirmations, disputes, slashing logic |

## Historical Stress Proof

The committed stress replay includes a June 2022 `stETH/ETH` depeg case study. In the deterministic proof:

| Metric | Result |
|---|---|
| First PegShield LTV cut | June 7, 2022 |
| First critical signal | June 9, 2022 |
| First static-LTV shortfall | June 13, 2022 |
| Peak static shortfall in scenario | `$51,946.38` |
| Peak PegShield shortfall in scenario | `$0` |
| Max modeled loss prevented | `$51,946.38` |

This is scenario-scale evidence. It proves earlier collateral tightening in the replay, not a guarantee of zero production bad debt.

## Scenario Breadth

`make scenario-lab` reads the committed bundle in `artifacts/stress_scenario.json`.

| Scenario class | Included examples |
|---|---|
| Historical depeg | `steth_june_2022` |
| Liquidity stress | `liquidity_vacuum` |
| Reflexive deleveraging | `reflexive_bank_run` |
| Slow impairment | `slow_grind_depeg` |
| Noise / snapback | `false_positive_wick`, `flash_crash_repricing` |
| Contagion / redemption | `svb_weekend_bank_run`, `stablecoin_redemption_spiral`, `restaking_bridge_contagion` |

The point is not that every synthetic path produces bad debt. The point is that the circuit breaker tightens during stress and recovers during false-positive paths instead of permanently disabling collateral.

## Why This Matters

Solana LST collateral is still mostly governed by static LTV tables. Those tables are slow because they rely on governance, risk committees, or manual parameter updates. PegShield is designed for the moment between "market stress is visible" and "governance can safely react."

The customer value is direct:

- reduce new risky credit during LST depeg or liquidity stress
- give protocols a reusable borrow-path guard instead of one-off risk scripts
- preserve a protocol-side fallback and max cap so lenders retain final authority
- replace single-operator trust with a threshold-attested update path

## Current Limitations

PegShield is not claiming production mainnet readiness today.

- Devnet deployment only
- No external audit yet
- Independent production attester operations are not live yet
- No signed production lender integration yet
- Mainnet deployment intentionally deferred until funding, legal wrapper, monitoring, and attester custody are ready

The proof today is execution depth: code-complete architecture, deterministic verification, historical stress evidence, and a developer surface a lending protocol can evaluate.
