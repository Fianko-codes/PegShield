"""Run the live statistical risk pipeline from bridge data to updater payload."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd

from calibration import derive_baseline
from ltv_calculator import compute_ltv
from ou_model import compute_spread, estimate_ou_params
from regime_detector import detect_regime

INPUT_PATH = Path(__file__).resolve().parent.parent / "bridge" / "data" / "latest_raw.json"
OUTPUT_PATH = Path(__file__).resolve().parent / "output" / "latest.json"


def load_bridge_payload(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def infer_step_seconds(history: list[dict[str, Any]]) -> int:
    if len(history) < 2:
        return 60
    deltas = [
        int(history[idx]["timestamp"]) - int(history[idx - 1]["timestamp"])
        for idx in range(1, len(history))
    ]
    positive = [delta for delta in deltas if delta > 0]
    return positive[0] if positive else 60


def build_risk_payload(bridge_payload: dict[str, Any]) -> dict[str, Any]:
    history = bridge_payload.get("history", [])
    if len(history) < 20:
        raise ValueError("Bridge payload does not contain enough historical samples")

    history_df = pd.DataFrame(history)
    step_seconds = infer_step_seconds(history)
    spread = compute_spread(history_df)

    ou_params = estimate_ou_params(spread, dt_seconds=step_seconds)
    regime = detect_regime(spread)
    baseline = derive_baseline(spread, dt_seconds=step_seconds)
    suggested_ltv = compute_ltv(
        theta=ou_params["theta"],
        sigma=ou_params["sigma"],
        regime_flag=regime["regime_flag"],
        baseline=baseline,
    )

    latest_row = history_df.iloc[-1]

    return {
        "lst_id": "mSOL",
        "theta": ou_params["theta"],
        "sigma": ou_params["sigma"],
        "regime_flag": regime["regime_flag"],
        "suggested_ltv": suggested_ltv,
        "z_score": regime["z_score"],
        "mu": ou_params["mu"],
        "adf_pvalue": regime["adf_pvalue"],
        "is_stationary": regime["is_stationary"],
        "status": regime["status"],
        "timestamp": int(latest_row["timestamp"]),
        "msol_price": round(float(latest_row["msol_usd_price"]), 8),
        "sol_price": round(float(latest_row["sol_usd_price"]), 8),
        "spread_pct": round(float(latest_row["msol_sol_spread_pct"]), 8),
        "baseline": baseline,
        "meta": {
            "source": bridge_payload["source"],
            "bridge_timestamp": bridge_payload["bridge_timestamp"],
            "history_points": len(history),
            "step_seconds": step_seconds,
        },
    }


def run_pipeline(input_path: Path = INPUT_PATH, output_path: Path = OUTPUT_PATH) -> Path:
    bridge_payload = load_bridge_payload(input_path)
    risk_payload = build_risk_payload(bridge_payload)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(risk_payload, indent=2), encoding="utf-8")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the statistical risk pipeline.")
    parser.add_argument("--input", default=str(INPUT_PATH))
    parser.add_argument("--output", default=str(OUTPUT_PATH))
    args = parser.parse_args()

    output_path = run_pipeline(Path(args.input), Path(args.output))
    print(f"Wrote risk payload to {output_path}")


if __name__ == "__main__":
    main()
