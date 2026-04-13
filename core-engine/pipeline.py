"""Thin bridge-to-updater pipeline.

This is intentionally not the final risk model. It converts live bridge data
into the on-chain updater payload using a documented heuristic so the end-to-end
system can run before the statistical engine exists.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

INPUT_PATH = Path(__file__).resolve().parent.parent / "bridge" / "data" / "latest_raw.json"
OUTPUT_PATH = Path(__file__).resolve().parent / "output" / "latest.json"

BASE_LTV = 0.80
LTV_FLOOR = 0.40


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def load_bridge_payload(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_risk_payload(bridge_payload: dict[str, Any]) -> dict[str, Any]:
    derived = bridge_payload["derived"]
    msol = bridge_payload["msol_usd"]
    sol = bridge_payload["sol_usd"]

    spread_pct = float(derived["msol_sol_spread_pct"])
    confidence_ratio = (
        (float(msol["confidence"]) / float(msol["price"])) +
        (float(sol["confidence"]) / float(sol["price"]))
    )

    # This is a temporary heuristic to keep the full chain path operational.
    theta = round(max(0.1, 6.0 - abs(spread_pct) * 10.0), 4)
    sigma = round(max(0.0001, confidence_ratio), 6)
    z_score = round(abs(spread_pct) / max(sigma, 1e-6), 4)
    regime_flag = 1 if abs(spread_pct) > 0.08 else 0

    if regime_flag:
        suggested_ltv = LTV_FLOOR
    else:
        suggested_ltv = clamp(BASE_LTV - abs(spread_pct) * 0.25, LTV_FLOOR, BASE_LTV)

    return {
        "lst_id": "mSOL",
        "theta": theta,
        "sigma": sigma,
        "regime_flag": regime_flag,
        "suggested_ltv": round(suggested_ltv, 4),
        "z_score": z_score,
        "meta": {
            "source": "heuristic-pipeline",
            "bridge_timestamp": bridge_payload["bridge_timestamp"],
            "note": "Temporary heuristic output until the statistical risk engine is implemented.",
        },
    }


def run_pipeline(input_path: Path = INPUT_PATH, output_path: Path = OUTPUT_PATH) -> Path:
    bridge_payload = load_bridge_payload(input_path)
    risk_payload = build_risk_payload(bridge_payload)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(risk_payload, indent=2), encoding="utf-8")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build updater payload from bridge data.")
    parser.add_argument("--input", default=str(INPUT_PATH))
    parser.add_argument("--output", default=str(OUTPUT_PATH))
    args = parser.parse_args()

    output_path = run_pipeline(Path(args.input), Path(args.output))
    print(f"Wrote risk payload to {output_path}")


if __name__ == "__main__":
    main()
