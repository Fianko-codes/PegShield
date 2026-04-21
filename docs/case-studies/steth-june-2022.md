# Case Study: stETH/ETH June 2022 Depeg

PegShield's core question is not "what is this asset worth?" It is "how much should a lender safely lend against this collateral right now?" This case study replays the June 2022 stETH/ETH discount through the PegShield risk engine and compares it against a fixed 80% collateral factor.

## Scope

- Scenario: `steth_june_2022`
- Window: May 18 to June 30, 2022
- Replay rows: 24
- Warmup points before replay: 20
- Collateral model: 100 units of stETH-like collateral
- Static baseline: 80% LTV
- PegShield policy: OU peg-deviation model, ADF/z-score regime detector, LTV floor at 40%

## Assumptions

- This is a replay, not a claim that PegShield existed or would have been integrated in June 2022.
- ETH daily closes are archived closes; stETH discount points use published anchors interpolated into the replay window.
- The bad-debt/shortfall numbers are scenario-scale dollars for the model's 100-unit collateral position, not market-wide losses.
- The dynamic borrower is modeled as if the protocol listened to the most conservative PegShield LTV reached during the event. This isolates the value of tightening collateral terms before the worst drawdown.
- The replay does not model liquidation auction latency, keeper competition, gas costs, venue-specific liquidity, or borrower behavior after margin calls.

## Result

PegShield tightened before the fixed-LTV baseline began showing shortfall.

- First critical PegShield signal: 2022-06-09 at -3.40% peg deviation
- First static-baseline shortfall: 2022-06-13 with $7,525.44 static shortfall
- Peak fixed-80% shortfall: $51,946.38
- Peak PegShield shortfall: $0.00
- Max scenario loss prevented: $51,946.38
- Peak LTV cut: 40.0%
- Final replay LTV: PegShield 40.0% vs static 80.0%

The important product takeaway is the timing: PegShield moved to a protective LTV before the replay's static collateral factor produced visible shortfall.

## Timeline

| Date | Peg deviation | z-score | Regime | PegShield LTV | Static LTV | PegShield shortfall | Static shortfall |
|---|---:|---:|---|---:|---:|---:|---:|
| 2022-06-07 | -2.40% | -1.62 | NORMAL | 50.1% | 80.0% | $0.00 | $0.00 |
| 2022-06-09 | -3.40% | -2.96 | CRITICAL | 40.0% | 80.0% | $0.00 | $0.00 |
| 2022-06-13 | -4.00% | -1.88 | NORMAL | 40.0% | 80.0% | $0.00 | $7,525.44 |
| 2022-06-16 | -7.00% | -2.97 | CRITICAL | 40.0% | 80.0% | $0.00 | $30,182.25 |
| 2022-06-19 | -6.27% | -1.91 | NORMAL | 40.0% | 80.0% | $0.00 | $51,946.38 |
| 2022-06-30 | -4.00% | -0.19 | NORMAL | 40.0% | 80.0% | $0.00 | $39,763.20 |

## What This Validates

- Peg deviation is the right signal to watch for LST collateral stress. The model is not reacting to normal staking-yield accrual; it is reacting to the market discount versus the reference rate.
- A dynamic risk feed can tighten before a governance process or manual risk review would normally adjust collateral factors.
- The useful integration path is asymmetric: stale, critical, or stressed conditions should reduce LTV or halt new borrowing, not increase risk.

## What It Does Not Prove

- It does not prove the current LTV mapping is production-calibrated for every Solana LST.
- It does not prove liquidators could realize the modeled collateral value during a live crisis.
- It does not remove the need for supply caps, borrow caps, liquidation-depth models, oracle confidence checks, and independent attesters.
- It does not prove market-wide bad debt would be zero; it proves the model's sample position had lower modeled shortfall than a fixed-80% baseline.

## Sources

- [Ethereum daily USD closes (archived)](https://www.poundsterlinglive.com/crypto-currency/ethereum-to-us-dollar-history-2022)
- [June 10, 2022 stETH depeg quote](https://coinscreed.com/lido-staked-ethereum-steth-price-falls-depegs-from-ethereum-trade-ratio/)
- [June 2022 stETH discount context](https://www.cnbc.com/2022/06/20/steth-price-falls-further-away-from-ether-sparking-more-crypto-market-fear.html)
- [stETH traded near 0.95 ETH in mid-June 2022](https://www.odaily.news/en/post/5179454)

## Reproduce

```bash
.venv/bin/python simulation/stress_test.py
.venv/bin/python scripts/sync_artifacts.py
.venv/bin/python scripts/build_steth_case_study.py
```

The source data lives in `simulation/data/steth_june_2022.json`; the normalized scenario bundle lives in `artifacts/stress_scenario.json`.
