"""Generate a stress replay using the statistical engine."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

SIM_DIR = Path(__file__).resolve().parent
ROOT_DIR = SIM_DIR.parent
CORE_ENGINE_DIR = ROOT_DIR / "core-engine"
if str(CORE_ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_ENGINE_DIR))

from calibration import derive_baseline
from ltv_calculator import CF_BASE, compute_ltv
from ou_model import compute_spread, estimate_ou_params
from regime_detector import detect_regime
from plot import plot_stress_scenario

INPUT_PATH = ROOT_DIR / "bridge" / "data" / "latest_raw.json"
OUTPUT_CSV = SIM_DIR / "charts" / "stress_scenario.csv"
OUTPUT_PNG = SIM_DIR / "charts" / "stress_scenario.png"


def load_bridge_payload(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def infer_step_seconds(history: list[dict[str, Any]]) -> int:
    if len(history) < 2:
        return 180
    return int(history[1]["timestamp"]) - int(history[0]["timestamp"])


def generate_stress_scenario(
    bridge_payload: dict[str, Any],
    periods: int = 60,
) -> pd.DataFrame:
    history = pd.DataFrame(bridge_payload["history"])
    spread = compute_spread(history)

    base_mean = float(spread.mean())
    base_std = float(spread.std(ddof=1))
    base_sol = float(history["sol_usd_price"].iloc[-1])
    step_seconds = infer_step_seconds(bridge_payload["history"])
    baseline = derive_baseline(spread, dt_seconds=step_seconds)

    rng = np.random.default_rng(42)
    timestamps = [
        pd.to_datetime(int(history["timestamp"].iloc[-1]) + step_seconds * (idx + 1), unit="s", utc=True)
        for idx in range(periods)
    ]

    normal_len = periods // 3
    stress_len = periods // 3
    recover_len = periods - normal_len - stress_len

    normal = base_mean + rng.normal(0, base_std * 0.35, normal_len)
    stress = np.linspace(base_mean, base_mean + 0.06, stress_len) + rng.normal(0, base_std * 0.45, stress_len)
    recovery = np.linspace(base_mean + 0.06, base_mean + 0.005, recover_len) + rng.normal(
        0, base_std * 0.30, recover_len
    )
    stress_path = np.concatenate([normal, stress, recovery])

    sol_price_path = np.concatenate(
        [
            np.linspace(base_sol, base_sol * 0.99, normal_len),
            np.linspace(base_sol * 0.99, base_sol * 0.92, stress_len),
            np.linspace(base_sol * 0.92, base_sol * 0.97, recover_len),
        ]
    )

    msol_price_path = sol_price_path * (1.0 + stress_path)

    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "sol_usd_price": sol_price_path,
            "msol_usd_price": msol_price_path,
            "spread_pct": stress_path,
            "baseline_theta_avg": baseline["theta_avg"],
            "baseline_sigma_avg": baseline["sigma_avg"],
        }
    )


def evaluate_oracle(df: pd.DataFrame, bridge_payload: dict[str, Any]) -> pd.DataFrame:
    history_df = pd.DataFrame(bridge_payload["history"]).copy()
    history_df["timestamp"] = pd.to_datetime(history_df["timestamp"], unit="s", utc=True)

    baseline_spread = compute_spread(pd.DataFrame(bridge_payload["history"]))
    step_seconds = infer_step_seconds(bridge_payload["history"])
    baseline = derive_baseline(baseline_spread, dt_seconds=step_seconds)

    collateral_units = 100.0
    initial_collateral_value = collateral_units * float(df["msol_usd_price"].iloc[0])
    borrowed_value = initial_collateral_value * CF_BASE

    ltv_dynamic: list[float] = []
    ltv_fixed: list[float] = []
    bad_debt_dynamic: list[float] = []
    bad_debt_fixed: list[float] = []
    theta_values: list[float] = []
    sigma_values: list[float] = []
    z_scores: list[float] = []
    regime_flags: list[int] = []

    rolling_source = history_df[["timestamp", "msol_usd_price", "sol_usd_price"]].copy()

    for row in df.itertuples(index=False):
        rolling_source.loc[len(rolling_source)] = {
            "timestamp": row.timestamp,
            "msol_usd_price": row.msol_usd_price,
            "sol_usd_price": row.sol_usd_price,
        }

        window_df = rolling_source.tail(40).reset_index(drop=True)
        spread = compute_spread(window_df)
        ou_params = estimate_ou_params(spread, dt_seconds=step_seconds)
        regime = detect_regime(spread)
        ltv = compute_ltv(
            theta=ou_params["theta"],
            sigma=ou_params["sigma"],
            regime_flag=regime["regime_flag"],
            baseline=baseline,
        )

        collateral_value = collateral_units * float(row.msol_usd_price)
        safe_dynamic = collateral_value * ltv
        safe_fixed = collateral_value * CF_BASE

        theta_values.append(ou_params["theta"])
        sigma_values.append(ou_params["sigma"])
        z_scores.append(regime["z_score"])
        regime_flags.append(regime["regime_flag"])
        ltv_dynamic.append(ltv)
        ltv_fixed.append(CF_BASE)
        bad_debt_dynamic.append(max(0.0, borrowed_value - safe_dynamic))
        bad_debt_fixed.append(max(0.0, borrowed_value - safe_fixed))

    result = df.copy()
    result["theta"] = theta_values
    result["sigma"] = sigma_values
    result["z_score"] = z_scores
    result["regime_flag"] = regime_flags
    result["ltv_with_oracle"] = ltv_dynamic
    result["ltv_no_oracle"] = ltv_fixed
    result["bad_debt_with_oracle"] = bad_debt_dynamic
    result["bad_debt_no_oracle"] = bad_debt_fixed
    return result


def run_stress_test(
    input_path: Path = INPUT_PATH,
    csv_output: Path = OUTPUT_CSV,
    png_output: Path = OUTPUT_PNG,
) -> tuple[Path, Path]:
    bridge_payload = load_bridge_payload(input_path)
    scenario = generate_stress_scenario(bridge_payload)
    evaluated = evaluate_oracle(scenario, bridge_payload)

    csv_output.parent.mkdir(parents=True, exist_ok=True)
    evaluated.to_csv(csv_output, index=False)
    plot_stress_scenario(evaluated, png_output)
    return csv_output, png_output


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the stress replay simulation.")
    parser.add_argument("--input", default=str(INPUT_PATH))
    parser.add_argument("--csv-output", default=str(OUTPUT_CSV))
    parser.add_argument("--png-output", default=str(OUTPUT_PNG))
    args = parser.parse_args()

    csv_path, png_path = run_stress_test(
        input_path=Path(args.input),
        csv_output=Path(args.csv_output),
        png_output=Path(args.png_output),
    )
    print(f"Wrote simulation csv to {csv_path}")
    print(f"Wrote simulation chart to {png_path}")


if __name__ == "__main__":
    main()
