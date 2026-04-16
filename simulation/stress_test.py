"""Generate a replay using the statistical engine.

The default path is a bundled historical replay (June 2022 stETH/ETH depeg).
The older synthetic mSOL/SOL stress generator is retained as a fallback mode so
the demo can still run offline from the current bridge baseline when needed.
"""

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
DEFAULT_REPLAY_FIXTURE = SIM_DIR / "data" / "steth_june_2022.json"
OUTPUT_CSV = SIM_DIR / "charts" / "stress_scenario.csv"
OUTPUT_PNG = SIM_DIR / "charts" / "stress_scenario.png"
OUTPUT_META = SIM_DIR / "charts" / "stress_scenario.meta.json"

FALLBACK_MARINADE_RATE = 1.17


def load_bridge_payload(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_historical_replay(
    path: Path = DEFAULT_REPLAY_FIXTURE,
) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    metadata = payload.get("replay", {}).copy()
    rows = payload.get("rows", [])
    warmup_points = int(metadata.get("warmup_points", 20))
    if len(rows) <= warmup_points:
        raise ValueError("Historical replay fixture must include warmup and replay rows")

    history = rows[:warmup_points]
    scenario = pd.DataFrame(rows[warmup_points:]).copy()
    scenario["timestamp"] = pd.to_datetime(scenario["timestamp"], unit="s", utc=True)
    if "spread_pct" not in scenario.columns:
        scenario["spread_pct"] = scenario["msol_sol_spread_pct"]

    bridge_payload = {
        "source": "historical-replay",
        "bridge_timestamp": scenario["timestamp"].iloc[0].isoformat(),
        "marinade_msol_sol_rate": float(metadata.get("reference_ratio", 1.0)),
        "marinade_rate_source": "historical-replay-fixture",
        "history": history,
        "history_source": "historical-replay-fixture",
    }

    baseline_spread = compute_spread(pd.DataFrame(history))
    step_seconds = infer_step_seconds(history)
    baseline = derive_baseline(baseline_spread, dt_seconds=step_seconds)
    scenario["baseline_theta_avg"] = baseline["theta_avg"]
    scenario["baseline_sigma_avg"] = baseline["sigma_avg"]

    metadata["warmup_points"] = warmup_points
    metadata["scenario_points"] = len(scenario)
    metadata["fixture_path"] = str(path.relative_to(ROOT_DIR))
    return scenario, bridge_payload, metadata


def infer_step_seconds(history: list[dict[str, Any]]) -> int:
    if len(history) < 2:
        return 180
    return int(history[1]["timestamp"]) - int(history[0]["timestamp"])


def _marinade_rate(bridge_payload: dict[str, Any]) -> float:
    rate = bridge_payload.get("asset_sol_reference_rate", bridge_payload.get("marinade_msol_sol_rate"))
    return float(rate) if rate else FALLBACK_MARINADE_RATE


def generate_stress_scenario(
    bridge_payload: dict[str, Any],
    periods: int = 60,
) -> pd.DataFrame:
    history = pd.DataFrame(bridge_payload["history"])
    spread = compute_spread(history)
    marinade_rate = _marinade_rate(bridge_payload)

    base_mean = float(spread.mean())
    base_std = float(spread.std(ddof=1))
    asset_column = "asset_usd_price" if "asset_usd_price" in history.columns else "msol_usd_price"
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

    # The "shock" is a NEGATIVE push on peg_deviation (mSOL trading below
    # intrinsic SOL value).  Magnitude scaled so it triggers regime detection.
    shock_magnitude = max(0.015, base_std * 5)  # at least -1.5 % deviation

    normal = base_mean + rng.normal(0, base_std * 0.35, normal_len)
    stress = (
        np.linspace(base_mean, base_mean - shock_magnitude, stress_len)
        + rng.normal(0, base_std * 0.45, stress_len)
    )
    recovery = (
        np.linspace(base_mean - shock_magnitude, base_mean - shock_magnitude * 0.1, recover_len)
        + rng.normal(0, base_std * 0.30, recover_len)
    )
    peg_deviation_path = np.concatenate([normal, stress, recovery])

    sol_price_path = np.concatenate(
        [
            np.linspace(base_sol, base_sol * 0.99, normal_len),
            np.linspace(base_sol * 0.99, base_sol * 0.92, stress_len),
            np.linspace(base_sol * 0.92, base_sol * 0.97, recover_len),
        ]
    )

    # Synthetic mSOL price reconstructed from peg_deviation:
    #   market_ratio = marinade_rate * (1 + peg_deviation)
    #   msol_usd = sol_usd * market_ratio
    market_ratio_path = marinade_rate * (1.0 + peg_deviation_path)
    asset_price_path = sol_price_path * market_ratio_path

    # Legacy spread_pct kept on each row for CSV backward-compatibility;
    # the regime model itself operates on peg_deviation.
    legacy_spread_pct = (asset_price_path - sol_price_path) / sol_price_path

    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "sol_usd_price": sol_price_path,
            "asset_usd_price": asset_price_path,
            "msol_usd_price": asset_price_path,
            "spread_pct": legacy_spread_pct,
            "peg_deviation": peg_deviation_path,
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
    marinade_rate = _marinade_rate(bridge_payload)
    asset_column = "asset_usd_price" if "asset_usd_price" in history_df.columns else "msol_usd_price"

    collateral_units = 100.0
    initial_collateral_value = collateral_units * float(df[asset_column].iloc[0])
    borrow_static = initial_collateral_value * CF_BASE

    ltv_dynamic: list[float] = []
    ltv_fixed: list[float] = []
    shortfall_dynamic: list[float] = []
    shortfall_static: list[float] = []
    theta_values: list[float] = []
    sigma_values: list[float] = []
    z_scores: list[float] = []
    regime_flags: list[int] = []
    borrow_dynamic: float | None = None

    rolling_source = history_df[
        ["timestamp", asset_column, "sol_usd_price"]
    ].copy()
    if asset_column != "msol_usd_price":
        rolling_source["msol_usd_price"] = history_df.get("msol_usd_price", history_df[asset_column])
    # Seed peg_deviation for each historical row so compute_spread uses the
    # correct signal throughout the rolling window.
    if "peg_deviation" in history_df.columns:
        rolling_source["peg_deviation"] = history_df["peg_deviation"]
    else:
        rolling_source["peg_deviation"] = (
            history_df["msol_usd_price"] / history_df["sol_usd_price"]
        ) / marinade_rate - 1.0

    for row in df.itertuples(index=False):
        rolling_source.loc[len(rolling_source)] = {
            "timestamp": row.timestamp,
            asset_column: getattr(row, asset_column),
            "sol_usd_price": row.sol_usd_price,
            "msol_usd_price": getattr(row, asset_column),
            "peg_deviation": row.peg_deviation,
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

        collateral_value = collateral_units * float(getattr(row, asset_column))
        if borrow_dynamic is None:
            borrow_dynamic = initial_collateral_value * ltv

        theta_values.append(ou_params["theta"])
        sigma_values.append(ou_params["sigma"])
        z_scores.append(regime["z_score"])
        regime_flags.append(regime["regime_flag"])
        ltv_dynamic.append(ltv)
        ltv_fixed.append(CF_BASE)
        shortfall_dynamic.append(max(0.0, borrow_dynamic - collateral_value))
        shortfall_static.append(max(0.0, borrow_static - collateral_value))

    result = df.copy()
    result["theta"] = theta_values
    result["sigma"] = sigma_values
    result["z_score"] = z_scores
    result["regime_flag"] = regime_flags
    result["ltv_with_oracle"] = ltv_dynamic
    result["ltv_no_oracle"] = ltv_fixed
    result["shortfall_dynamic"] = shortfall_dynamic
    result["shortfall_static"] = shortfall_static
    # Deprecated aliases kept so existing dashboard snapshots continue to parse.
    result["bad_debt_with_oracle"] = shortfall_dynamic
    result["bad_debt_no_oracle"] = shortfall_static
    return result


def run_stress_test(
    input_path: Path = INPUT_PATH,
    replay_path: Path = DEFAULT_REPLAY_FIXTURE,
    csv_output: Path = OUTPUT_CSV,
    png_output: Path = OUTPUT_PNG,
    meta_output: Path = OUTPUT_META,
    mode: str = "historical",
) -> tuple[Path, Path, Path]:
    if mode == "historical":
        scenario, bridge_payload, replay_metadata = load_historical_replay(replay_path)
    elif mode == "synthetic":
        bridge_payload = load_bridge_payload(input_path)
        scenario = generate_stress_scenario(bridge_payload)
        replay_metadata = {
            "id": "synthetic_msol_baseline",
            "kind": "synthetic",
            "title": "Synthetic mSOL/SOL stress replay",
            "description": (
                "Generated stress path calibrated from the current live bridge baseline."
            ),
            "asset_symbol": "mSOL",
            "base_symbol": "SOL",
            "reference_ratio": _marinade_rate(bridge_payload),
            "event_window_label": "Forward-generated 60-step replay",
            "warmup_points": len(bridge_payload.get("history", [])),
            "scenario_points": len(scenario),
            "fixture_path": None,
            "sources": [],
        }
    else:
        raise ValueError(f"Unsupported simulation mode: {mode}")

    evaluated = evaluate_oracle(scenario, bridge_payload)

    csv_output.parent.mkdir(parents=True, exist_ok=True)
    evaluated.to_csv(csv_output, index=False)
    plot_stress_scenario(
        evaluated,
        png_output,
        title=f"{replay_metadata['title']} — Fixed LTV vs Dynamic Oracle LTV",
        subtitle=replay_metadata["description"],
    )
    meta_output.write_text(
        json.dumps({"replay": replay_metadata}, indent=2),
        encoding="utf-8",
    )
    return csv_output, png_output, meta_output


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the replay simulation.")
    parser.add_argument("--input", default=str(INPUT_PATH))
    parser.add_argument("--replay-path", default=str(DEFAULT_REPLAY_FIXTURE))
    parser.add_argument("--csv-output", default=str(OUTPUT_CSV))
    parser.add_argument("--png-output", default=str(OUTPUT_PNG))
    parser.add_argument("--meta-output", default=str(OUTPUT_META))
    parser.add_argument(
        "--mode",
        choices=("historical", "synthetic"),
        default="historical",
    )
    args = parser.parse_args()

    csv_path, png_path, meta_path = run_stress_test(
        input_path=Path(args.input),
        replay_path=Path(args.replay_path),
        csv_output=Path(args.csv_output),
        png_output=Path(args.png_output),
        meta_output=Path(args.meta_output),
        mode=args.mode,
    )
    print(f"Wrote simulation csv to {csv_path}")
    print(f"Wrote simulation chart to {png_path}")
    print(f"Wrote replay metadata to {meta_path}")


if __name__ == "__main__":
    main()
