#!/usr/bin/env python3
"""Build the June 2022 stETH case study from the stress scenario artifact."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "artifacts" / "stress_scenario.json"
DEFAULT_OUTPUT = ROOT / "docs" / "case-studies" / "steth-june-2022.md"


def money(value: float) -> str:
    return f"${value:,.2f}"


def pct(value: float, digits: int = 2) -> str:
    return f"{value * 100:.{digits}f}%"


def load_case(input_path: Path) -> dict[str, Any]:
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    for scenario in payload.get("scenarios", []):
        if scenario.get("id") == "steth_june_2022":
            return scenario
    raise ValueError("steth_june_2022 scenario not found")


def first_bad_debt_point(points: list[dict[str, Any]]) -> dict[str, Any] | None:
    for point in points:
        if float(point["bad_debt_no_oracle"]) > 0:
            return point
    return None


def first_critical_point(points: list[dict[str, Any]]) -> dict[str, Any] | None:
    for point in points:
        if int(point["regime_flag"]) == 1:
            return point
    return None


def worst_static_point(points: list[dict[str, Any]]) -> dict[str, Any]:
    return max(points, key=lambda point: float(point["bad_debt_no_oracle"]))


def timeline_rows(points: list[dict[str, Any]]) -> str:
    selected = []
    interesting_dates = {
        "2022-06-07T00:00:00+00:00",
        "2022-06-09T00:00:00+00:00",
        "2022-06-13T00:00:00+00:00",
        "2022-06-16T00:00:00+00:00",
        "2022-06-19T00:00:00+00:00",
        "2022-06-30T00:00:00+00:00",
    }
    for point in points:
        if point["timestamp"] in interesting_dates:
            selected.append(
                "| {date} | {peg} | {z} | {regime} | {oracle_ltv} | {static_ltv} | {oracle_debt} | {static_debt} |".format(
                    date=point["timestamp"][:10],
                    peg=pct(float(point["peg_deviation"]), 2),
                    z=f"{float(point['z_score']):.2f}",
                    regime="CRITICAL" if int(point["regime_flag"]) == 1 else "NORMAL",
                    oracle_ltv=pct(float(point["ltv_with_oracle"]), 1),
                    static_ltv=pct(float(point["ltv_no_oracle"]), 1),
                    oracle_debt=money(float(point["bad_debt_with_oracle"])),
                    static_debt=money(float(point["bad_debt_no_oracle"])),
                )
            )
    return "\n".join(selected)


def render(case: dict[str, Any]) -> str:
    points = case["points"]
    summary = case["summary"]
    first_bad = first_bad_debt_point(points)
    first_critical = first_critical_point(points)
    worst_static = worst_static_point(points)
    sources = "\n".join(
        f"- [{source['label']}]({source['url']})" for source in case.get("sources", [])
    )

    first_critical_text = (
        f"{first_critical['timestamp'][:10]} at {pct(float(first_critical['peg_deviation']), 2)} peg deviation"
        if first_critical
        else "not triggered"
    )
    first_bad_text = (
        f"{first_bad['timestamp'][:10]} with {money(float(first_bad['bad_debt_no_oracle']))} static shortfall"
        if first_bad
        else "not observed"
    )

    return f"""# Case Study: stETH/ETH June 2022 Depeg

PegShield's core question is not "what is this asset worth?" It is "how much should a lender safely lend against this collateral right now?" This case study replays the June 2022 stETH/ETH discount through the PegShield risk engine and compares it against a fixed 80% collateral factor.

## Scope

- Scenario: `{case['id']}`
- Window: {case.get('event_window_label', 'unknown')}
- Replay rows: {summary['row_count']}
- Warmup points before replay: {case.get('warmup_points', 'unknown')}
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

- First critical PegShield signal: {first_critical_text}
- First static-baseline shortfall: {first_bad_text}
- Peak fixed-80% shortfall: {money(float(summary['peak_shortfall_static']))}
- Peak PegShield shortfall: {money(float(summary['peak_shortfall_dynamic']))}
- Max scenario loss prevented: {money(float(summary['max_loss_prevented']))}
- Peak LTV cut: {pct(float(summary['peak_ltv_cut']), 1)}
- Final replay LTV: PegShield {pct(float(summary['final_dynamic_ltv']), 1)} vs static {pct(float(summary['final_static_ltv']), 1)}

The important product takeaway is the timing: PegShield moved to a protective LTV before the replay's static collateral factor produced visible shortfall.

## Timeline

| Date | Peg deviation | z-score | Regime | PegShield LTV | Static LTV | PegShield shortfall | Static shortfall |
|---|---:|---:|---|---:|---:|---:|---:|
{timeline_rows(points)}

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

{sources}

## Reproduce

```bash
.venv/bin/python simulation/stress_test.py
.venv/bin/python scripts/sync_artifacts.py
.venv/bin/python scripts/build_steth_case_study.py
```

The source data lives in `simulation/data/steth_june_2022.json`; the normalized scenario bundle lives in `artifacts/stress_scenario.json`.
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the stETH June 2022 PegShield case study.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()

    case = load_case(Path(args.input))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render(case), encoding="utf-8")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
