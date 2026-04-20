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

LEGACY_INPUT_PATH = ROOT_DIR / "bridge" / "data" / "latest_raw.json"
PRIMARY_INPUT_PATH = ROOT_DIR / "bridge" / "data" / "latest_raw.mSOL-v2.json"
INPUT_PATH = LEGACY_INPUT_PATH
DEFAULT_REPLAY_FIXTURE = SIM_DIR / "data" / "steth_june_2022.json"
OUTPUT_CSV = SIM_DIR / "charts" / "stress_scenario.csv"
OUTPUT_PNG = SIM_DIR / "charts" / "stress_scenario.png"
OUTPUT_META = SIM_DIR / "charts" / "stress_scenario.meta.json"

FALLBACK_MARINADE_RATE = 1.17
DEFAULT_SCENARIO_BUNDLE_SIZE = 20


def resolve_bridge_payload_path(path: Path) -> Path:
    if path.exists():
        return path
    if path == LEGACY_INPUT_PATH and PRIMARY_INPUT_PATH.exists():
        return PRIMARY_INPUT_PATH
    raise FileNotFoundError(f"Bridge payload not found at {path}")


def load_bridge_payload(path: Path) -> dict[str, Any]:
    resolved = resolve_bridge_payload_path(path)
    return json.loads(resolved.read_text(encoding="utf-8"))


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


def generate_custom_scenario(
    bridge_payload: dict[str, Any],
    *,
    periods: int,
    seed: int,
    peg_targets: list[float],
    peg_lengths: list[int],
    sol_multipliers: list[float],
    sol_lengths: list[int],
    peg_noise_scale: float = 0.5,
    sol_noise_scale: float = 0.003,
) -> pd.DataFrame:
    history = pd.DataFrame(bridge_payload["history"])
    spread = compute_spread(history)
    reference_rate = _marinade_rate(bridge_payload)
    step_seconds = infer_step_seconds(bridge_payload["history"])
    baseline = derive_baseline(spread, dt_seconds=step_seconds)
    base_mean = float(spread.mean())
    base_std = float(spread.std(ddof=1))
    base_sol = float(history["sol_usd_price"].iloc[-1])

    if sum(peg_lengths) != periods or sum(sol_lengths) != periods:
        raise ValueError("Scenario segment lengths must add up to periods")

    rng = np.random.default_rng(seed)
    timestamps = [
        pd.to_datetime(int(history["timestamp"].iloc[-1]) + step_seconds * (idx + 1), unit="s", utc=True)
        for idx in range(periods)
    ]

    def build_segment_path(start: float, targets: list[float], lengths: list[int], noise_scale: float) -> np.ndarray:
        # Targets are approach points, not visited points: endpoint=False means each
        # segment stops one step short of its target so the next segment picks it up
        # as its own starting value. The final path[-1] = targets[-1] makes sure the
        # very last target is actually reached at the end of the run.
        values: list[np.ndarray] = []
        current = start
        for target, length in zip(targets, lengths, strict=True):
            base = np.linspace(current, target, length, endpoint=False)
            noise = rng.normal(0, max(base_std * noise_scale, 1e-6), length)
            values.append(base + noise)
            current = target
        path = np.concatenate(values)
        path[-1] = targets[-1]
        return path

    peg_path = build_segment_path(base_mean, peg_targets, peg_lengths, peg_noise_scale)
    sol_path = build_segment_path(base_sol, [base_sol * multiplier for multiplier in sol_multipliers], sol_lengths, sol_noise_scale)

    market_ratio_path = reference_rate * (1.0 + peg_path)
    asset_price_path = sol_path * market_ratio_path
    legacy_spread_pct = (asset_price_path - sol_path) / sol_path

    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "sol_usd_price": sol_path,
            "asset_usd_price": asset_price_path,
            "msol_usd_price": asset_price_path,
            "spread_pct": legacy_spread_pct,
            "peg_deviation": peg_path,
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

    # First pass: compute all LTVs to find the minimum (worst-case oracle recommendation)
    # This represents "if you had listened to the oracle at its most cautious point"
    rolling_source_preview = history_df[
        ["timestamp", asset_column, "sol_usd_price"]
    ].copy()
    if asset_column != "msol_usd_price":
        rolling_source_preview["msol_usd_price"] = history_df.get("msol_usd_price", history_df[asset_column])
    if "peg_deviation" in history_df.columns:
        rolling_source_preview["peg_deviation"] = history_df["peg_deviation"]
    else:
        rolling_source_preview["peg_deviation"] = (
            history_df["msol_usd_price"] / history_df["sol_usd_price"]
        ) / marinade_rate - 1.0

    preview_ltvs: list[float] = []
    for row in df.itertuples(index=False):
        rolling_source_preview.loc[len(rolling_source_preview)] = {
            "timestamp": row.timestamp,
            asset_column: getattr(row, asset_column),
            "sol_usd_price": row.sol_usd_price,
            "msol_usd_price": getattr(row, asset_column),
            "peg_deviation": row.peg_deviation,
        }
        window_df = rolling_source_preview.tail(40).reset_index(drop=True)
        spread = compute_spread(window_df)
        ou_params = estimate_ou_params(spread, dt_seconds=step_seconds)
        regime = detect_regime(spread)
        ltv = compute_ltv(
            theta=ou_params["theta"],
            sigma=ou_params["sigma"],
            regime_flag=regime["regime_flag"],
            baseline=baseline,
        )
        preview_ltvs.append(ltv)

    # Use minimum LTV for borrow_dynamic - shows oracle's protective value
    min_ltv = min(preview_ltvs) if preview_ltvs else CF_BASE
    borrow_dynamic = initial_collateral_value * min_ltv

    ltv_dynamic: list[float] = []
    ltv_fixed: list[float] = []
    shortfall_dynamic: list[float] = []
    shortfall_static: list[float] = []
    theta_values: list[float] = []
    sigma_values: list[float] = []
    z_scores: list[float] = []
    regime_flags: list[int] = []

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

    for idx, row in enumerate(df.itertuples(index=False)):
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
    # Deprecated aliases kept so existing snapshot consumers continue to parse.
    result["bad_debt_with_oracle"] = shortfall_dynamic
    result["bad_debt_no_oracle"] = shortfall_static
    return result


def normalize_simulation_points(df: pd.DataFrame) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for row in df.to_dict(orient="records"):
        timestamp = row["timestamp"]
        if isinstance(timestamp, pd.Timestamp):
            timestamp_value = timestamp.isoformat()
        else:
            timestamp_value = str(timestamp)

        points.append(
            {
                "timestamp": timestamp_value,
                "spread_pct": float(row["spread_pct"]),
                "peg_deviation": (
                    float(row["peg_deviation"]) if row.get("peg_deviation") is not None else None
                ),
                "theta": float(row["theta"]),
                "sigma": float(row["sigma"]),
                "z_score": float(row["z_score"]),
                "regime_flag": int(row["regime_flag"]),
                "ltv_with_oracle": float(row["ltv_with_oracle"]),
                "ltv_no_oracle": float(row["ltv_no_oracle"]),
                "shortfall_dynamic": float(row["shortfall_dynamic"]),
                "shortfall_static": float(row["shortfall_static"]),
                "bad_debt_with_oracle": float(row["bad_debt_with_oracle"]),
                "bad_debt_no_oracle": float(row["bad_debt_no_oracle"]),
            }
        )
    return points


def summarize_simulation(points: list[dict[str, Any]]) -> dict[str, Any]:
    final_row = points[-1] if points else None
    static_series = [point["shortfall_static"] for point in points]
    dynamic_series = [point["shortfall_dynamic"] for point in points]
    loss_prevented_series = [
        max(0.0, point["shortfall_static"] - point["shortfall_dynamic"]) for point in points
    ]
    critical_indexes = [idx for idx, point in enumerate(points) if point["regime_flag"] == 1]
    peak_ltv_cut = max(
        ((point["ltv_no_oracle"] - point["ltv_with_oracle"]) for point in points),
        default=0.0,
    )

    return {
        "row_count": len(points),
        "max_spread_pct": max((point["spread_pct"] for point in points), default=0.0),
        "min_spread_pct": min((point["spread_pct"] for point in points), default=0.0),
        "max_peg_deviation": max(
            (point["peg_deviation"] for point in points if point["peg_deviation"] is not None),
            default=0.0,
        ),
        "min_peg_deviation": min(
            (point["peg_deviation"] for point in points if point["peg_deviation"] is not None),
            default=0.0,
        ),
        "max_z_score": max((point["z_score"] for point in points), default=0.0),
        "critical_rows": len(critical_indexes),
        "critical_start_index": critical_indexes[0] if critical_indexes else None,
        "critical_end_index": critical_indexes[-1] if critical_indexes else None,
        "critical_duration_ratio": (len(critical_indexes) / len(points)) if points else 0.0,
        "peak_shortfall_static": max(static_series, default=0.0),
        "peak_shortfall_dynamic": max(dynamic_series, default=0.0),
        "final_dynamic_ltv": final_row["ltv_with_oracle"] if final_row else 0.0,
        "final_static_ltv": final_row["ltv_no_oracle"] if final_row else 0.0,
        "final_loss_prevented": loss_prevented_series[-1] if loss_prevented_series else 0.0,
        "max_loss_prevented": max(loss_prevented_series, default=0.0),
        "peak_ltv_cut": peak_ltv_cut,
        "recovered_to_monitoring": bool(points and final_row and final_row["regime_flag"] == 0),
    }


def _scenario_payload(
    *,
    replay: dict[str, Any],
    evaluated: pd.DataFrame,
) -> dict[str, Any]:
    points = normalize_simulation_points(evaluated)
    return {
        **replay,
        "initial_window": min(DEFAULT_SCENARIO_BUNDLE_SIZE, len(points)),
        "points": points,
        "summary": summarize_simulation(points),
    }


def build_simulation_bundle(
    input_path: Path = INPUT_PATH,
    replay_path: Path = DEFAULT_REPLAY_FIXTURE,
) -> dict[str, Any]:
    historical_df, historical_bridge, historical_meta = load_historical_replay(replay_path)
    historical_eval = evaluate_oracle(historical_df, historical_bridge)

    live_bridge = load_bridge_payload(input_path)
    asset_symbol = str(live_bridge.get("asset_symbol", "mSOL"))
    base_symbol = str(live_bridge.get("base_symbol", "SOL"))
    reference_ratio = _marinade_rate(live_bridge)

    scenarios = [
        _scenario_payload(
            replay={
                **historical_meta,
                "tagline": "Real contagion, real forced deleveraging, real historical price path.",
                "risk_focus": "Historical collateral impairment",
                "highlights": [
                    "Real stETH/ETH June 2022 event data instead of a hand-drawn stress curve.",
                    "Shows how static 80% lending would have walked straight into default risk.",
                    "PegShield tightens early enough to keep loss prevention visible in dollars.",
                ],
            },
            evaluated=historical_eval,
        ),
    ]

    synthetic_specs = [
        {
            "id": "liquidity_vacuum",
            "title": f"{asset_symbol}/{base_symbol} liquidity vacuum",
            "description": "Depth disappears in a few intervals, the peg gaps lower, and recovery never fully repairs the damage.",
            "tagline": "Fast gap down, shallow rebound, toxic liquidation window.",
            "risk_focus": "Liquidity vacuum",
            "event_window_label": "Synthetic gap event",
            "kind": "synthetic",
            "seed": 314,
            "periods": 42,
            "peg_targets": [-0.004, -0.018, -0.056, -0.083, -0.068],
            "peg_lengths": [8, 8, 8, 8, 10],
            "sol_multipliers": [0.995, 0.965, 0.91, 0.865, 0.89],
            "sol_lengths": [8, 8, 8, 8, 10],
            "highlights": [
                "Peg stress outruns liquidity before liquidators can recycle capital.",
                "Oracle tightening matters most during the violent first leg, not after the rebound.",
                "Peak prevented loss happens before the path has time to stabilize.",
            ],
        },
        {
            "id": "reflexive_bank_run",
            "title": f"{asset_symbol}/{base_symbol} reflexive bank run",
            "description": "The market sells in waves: first panic, brief relief, then a second leg lower as confidence breaks.",
            "tagline": "Two-leg selloff with a fake recovery in the middle.",
            "risk_focus": "Reflexive deleveraging",
            "event_window_label": "Synthetic cascading liquidation event",
            "kind": "synthetic",
            "seed": 512,
            "periods": 48,
            "peg_targets": [-0.003, -0.022, -0.061, -0.043, -0.091, -0.072],
            "peg_lengths": [8, 8, 8, 6, 8, 10],
            "sol_multipliers": [0.998, 0.98, 0.93, 0.945, 0.86, 0.875],
            "sol_lengths": [8, 8, 8, 6, 8, 10],
            "highlights": [
                "The mid-event bounce is exactly where static policy creates false confidence.",
                "A second stress leg keeps the regime detector under pressure longer.",
                "Time spent in CRITICAL matters here almost as much as the peak drawdown.",
            ],
        },
        {
            "id": "slow_grind_depeg",
            "title": f"{asset_symbol}/{base_symbol} slow grind depeg",
            "description": "No single violent move — the peg drifts a little deeper every interval for days until the cumulative dislocation is dangerous.",
            "tagline": "Death by a thousand cuts; no single candle tells the story.",
            "risk_focus": "Slow creeping impairment",
            "event_window_label": "Synthetic slow-drift event",
            "kind": "synthetic",
            "seed": 202,
            "periods": 50,
            "peg_targets": [-0.003, -0.010, -0.020, -0.032, -0.044],
            "peg_lengths": [10, 10, 10, 10, 10],
            "sol_multipliers": [0.998, 0.990, 0.978, 0.965, 0.95],
            "sol_lengths": [10, 10, 10, 10, 10],
            "highlights": [
                "Tests whether the oracle catches slow impairment before any single day looks alarming.",
                "Static 80% policy looks fine on any given day, but bleeds loss continuously.",
                "Critical regime trips late here — detection latency is the risk being measured.",
            ],
        },
        {
            "id": "false_positive_wick",
            "title": f"{asset_symbol}/{base_symbol} single-wick false alarm",
            "description": "An isolated wick prints an ugly -2% peg deviation for one interval, then snaps cleanly back to baseline.",
            "tagline": "Was that a real depeg or a bad print? The oracle has to decide.",
            "risk_focus": "Noise resilience",
            "event_window_label": "Synthetic single-wick event",
            "kind": "synthetic",
            "seed": 777,
            "periods": 36,
            "peg_targets": [-0.003, -0.022, -0.004, -0.002],
            "peg_lengths": [10, 2, 12, 12],
            "sol_multipliers": [0.999, 0.985, 0.995, 0.998],
            "sol_lengths": [10, 2, 12, 12],
            "highlights": [
                "A risk oracle that panics on every wick is useless for production lending.",
                "This path probes false-positive behavior: does CRITICAL clear once the signal reverts?",
                "Any sustained LTV cut after the wick recovers is a regime-detector failure.",
            ],
        },
        {
            "id": "flash_crash_repricing",
            "title": f"{asset_symbol}/{base_symbol} flash crash repricing",
            "description": "The peg breaks violently, prints an ugly wick, then mean-reverts faster than the worst-case scenarios.",
            "tagline": "Short, brutal dislocation with a fast snapback.",
            "risk_focus": "Flash crash / snapback",
            "event_window_label": "Synthetic wick event",
            "kind": "synthetic",
            "seed": 911,
            "periods": 40,
            "peg_targets": [-0.004, -0.014, -0.048, -0.018, -0.006],
            "peg_lengths": [8, 6, 6, 10, 10],
            "sol_multipliers": [0.998, 0.982, 0.95, 0.975, 0.992],
            "sol_lengths": [8, 6, 6, 10, 10],
            "highlights": [
                "A good risk oracle should survive false positives without staying punitive forever.",
                "This path tests whether the system can tighten hard and still exit CRITICAL cleanly.",
                "Fast mean reversion is visible in both theta stabilization and the loss-prevented curve.",
            ],
        },
    ]

    for spec in synthetic_specs:
        scenario_df = generate_custom_scenario(
            live_bridge,
            periods=spec["periods"],
            seed=spec["seed"],
            peg_targets=spec["peg_targets"],
            peg_lengths=spec["peg_lengths"],
            sol_multipliers=spec["sol_multipliers"],
            sol_lengths=spec["sol_lengths"],
        )
        evaluated = evaluate_oracle(scenario_df, live_bridge)
        scenarios.append(
            _scenario_payload(
                replay={
                    "id": spec["id"],
                    "kind": spec["kind"],
                    "title": spec["title"],
                    "description": spec["description"],
                    "asset_symbol": asset_symbol,
                    "base_symbol": base_symbol,
                    "reference_ratio": reference_ratio,
                    "event_window_label": spec["event_window_label"],
                    "warmup_points": len(live_bridge.get("history", [])),
                    "scenario_points": len(scenario_df),
                    "fixture_path": None,
                    "sources": [],
                    "tagline": spec["tagline"],
                    "risk_focus": spec["risk_focus"],
                    "highlights": spec["highlights"],
                },
                evaluated=evaluated,
            ),
        )

    default_scenario = scenarios[0]
    return {
        "default_scenario_id": default_scenario["id"],
        "scenarios": scenarios,
        # Backward-compatible top-level fields for older consumers.
        "points": default_scenario["points"],
        "replay": {
            key: value
            for key, value in default_scenario.items()
            if key not in {"points", "summary", "initial_window"}
        },
        "summary": default_scenario["summary"],
    }


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
