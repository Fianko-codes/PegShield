#!/usr/bin/env python3
"""Sync oracle and simulation artifacts into a repo-level artifacts directory."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SIMULATION_DIR = ROOT / "simulation"
if str(SIMULATION_DIR) not in sys.path:
    sys.path.insert(0, str(SIMULATION_DIR))

from stress_test import build_simulation_bundle

ARTIFACTS_DIR = ROOT / "artifacts"
ORACLE_INPUT = ROOT / "core-engine" / "output" / "latest.json"
BRIDGE_INPUT = ROOT / "bridge" / "data" / "latest_raw.json"
ENV_INPUT = ROOT / ".env"
DEFAULT_OUTPUT = ARTIFACTS_DIR / "oracle_state.json"


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def iso_from_unix(timestamp: int) -> str:
    return datetime.fromtimestamp(timestamp, tz=UTC).isoformat()


def risk_state_pda_from_env(lst_id: str, env: dict[str, str]) -> str:
    normalized = lst_id.lower()
    if normalized.startswith("bsol"):
        return env.get("BSOL_RISK_STATE_PDA", env.get("ORACLE_RISK_STATE_PDA", ""))
    if normalized.startswith("jitosol"):
        return env.get("JITOSOL_RISK_STATE_PDA", env.get("ORACLE_RISK_STATE_PDA", ""))
    if normalized.startswith("msol"):
        return env.get(
            "MSOL_RISK_STATE_PDA",
            env.get("ORACLE_RISK_STATE_PDA", "7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo"),
        )
    return env.get("ORACLE_RISK_STATE_PDA", "")


def snapshot_name_for_lst(lst_id: str) -> str:
    return f"oracle_state.{lst_id}.json"


def history_is_trusted(history_source: str) -> bool:
    return "fallback" not in history_source


def build_oracle_snapshot(
    oracle_input: Path,
    bridge_input: Path,
    env_input: Path,
) -> dict:
    oracle_payload = load_json(oracle_input)
    bridge_payload = load_json(bridge_input)
    env = load_env(env_input)

    history_source = bridge_payload.get("history_source", "unknown")
    trusted_history = history_is_trusted(history_source)
    derived = bridge_payload.get("derived", {})
    asset_usd = bridge_payload.get("asset_usd", {})
    sol_usd = bridge_payload.get("sol_usd", {})
    live_asset_price = asset_usd.get(
        "price",
        oracle_payload.get("asset_price", oracle_payload["msol_price"]),
    )
    live_sol_price = sol_usd.get("price", oracle_payload["sol_price"])
    live_spread_pct = derived.get(
        "asset_sol_spread_pct",
        derived.get("msol_sol_spread_pct", oracle_payload.get("spread_pct")),
    )
    live_peg_deviation_pct = derived.get(
        "peg_deviation_pct",
        oracle_payload.get("peg_deviation_pct"),
    )
    reference_rate = bridge_payload.get(
        "asset_sol_reference_rate",
        bridge_payload.get("marinade_msol_sol_rate", oracle_payload.get("reference_rate")),
    )
    reference_rate_source = bridge_payload.get(
        "reference_rate_source",
        bridge_payload.get(
            "marinade_rate_source",
            oracle_payload.get("reference_rate_source", "unknown"),
        ),
    )

    history = [
        {
            "timestamp": int(point["timestamp"]),
            "spread_pct": float(point["msol_sol_spread_pct"]),
            "asset_price": float(point.get("asset_usd_price", point["msol_usd_price"])),
            "msol_price": float(point["msol_usd_price"]),
            "sol_price": float(point["sol_usd_price"]),
            "peg_deviation": (
                float(point["peg_deviation"])
                if point.get("peg_deviation") is not None
                else None
            ),
        }
        for point in bridge_payload.get("history", [])
    ]
    if not trusted_history:
        history = []

    snapshot = {
        "lst_id": oracle_payload["lst_id"],
        "asset_symbol": oracle_payload.get("asset_symbol"),
        "asset_display_name": oracle_payload.get("asset_display_name"),
        "base_symbol": oracle_payload.get("base_symbol", "SOL"),
        "theta": float(oracle_payload["theta"]),
        "sigma": float(oracle_payload["sigma"]),
        "regime_flag": int(oracle_payload["regime_flag"]),
        "suggested_ltv": float(oracle_payload["suggested_ltv"]),
        "z_score": float(oracle_payload["z_score"]),
        "spread": float(live_spread_pct),
        "spread_pct": float(live_spread_pct),
        "spread_signal": (
            oracle_payload.get("spread_signal", "unknown")
            if trusted_history
            else "live_market_only"
        ),
        "peg_deviation_pct": (
            float(live_peg_deviation_pct) if live_peg_deviation_pct is not None else None
        ),
        "asset_price": float(live_asset_price),
        "reference_rate": float(reference_rate) if reference_rate is not None else None,
        "reference_rate_source": reference_rate_source,
        "marinade_msol_sol_rate": float(reference_rate) if reference_rate is not None else None,
        "marinade_rate_source": reference_rate_source,
        "timestamp": int(oracle_payload["timestamp"]),
        "updated_at_iso": iso_from_unix(int(oracle_payload["timestamp"])),
        "status": oracle_payload.get("status", "UNKNOWN"),
        "msol_price": float(live_asset_price),
        "sol_price": float(live_sol_price),
        "source": oracle_payload.get("meta", {}).get(
            "source",
            bridge_payload.get("source", "unknown"),
        ),
        "bridge_timestamp": bridge_payload.get("bridge_timestamp"),
        "history_points": len(history),
        "history_source": history_source if trusted_history else f"{history_source}_withheld",
        "step_seconds": (
            int(oracle_payload.get("meta", {}).get("step_seconds", 0))
            if trusted_history
            else 0
        ),
        "program_id": env.get("PROGRAM_ID", ""),
        "risk_state_pda": risk_state_pda_from_env(oracle_payload["lst_id"], env),
        "authority": env.get("ORACLE_AUTHORITY", ""),
        "network": "solana-devnet",
        "analytics_status": "trusted" if trusted_history else "withheld_fallback_history",
        "history": history,
    }
    if trusted_history:
        snapshot["mu"] = float(oracle_payload["mu"])
        snapshot["adf_pvalue"] = float(oracle_payload["adf_pvalue"])
        snapshot["is_stationary"] = bool(oracle_payload["is_stationary"])
        snapshot["data_timestamp"] = int(
            oracle_payload.get("data_timestamp", oracle_payload["timestamp"]),
        )
        snapshot["baseline"] = oracle_payload.get("baseline", {})
    return snapshot


def build_simulation_snapshot() -> dict:
    return build_simulation_bundle()


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync oracle artifacts into artifacts/.")
    parser.add_argument("--oracle-input", default=str(ORACLE_INPUT))
    parser.add_argument("--bridge-input", default=str(BRIDGE_INPUT))
    parser.add_argument("--env-input", default=str(ENV_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--write-asset-alias", action="store_true")
    parser.add_argument("--skip-simulation", action="store_true")
    args = parser.parse_args()

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = Path(args.output)
    oracle_snapshot = build_oracle_snapshot(
        Path(args.oracle_input),
        Path(args.bridge_input),
        Path(args.env_input),
    )
    output_path.write_text(json.dumps(oracle_snapshot, indent=2), encoding="utf-8")
    if args.write_asset_alias:
        asset_output = output_path.parent / snapshot_name_for_lst(oracle_snapshot["lst_id"])
        if asset_output != output_path:
            asset_output.write_text(json.dumps(oracle_snapshot, indent=2), encoding="utf-8")

    if not args.skip_simulation:
        simulation_snapshot = build_simulation_snapshot()
        (ARTIFACTS_DIR / "stress_scenario.json").write_text(
            json.dumps(simulation_snapshot, indent=2),
            encoding="utf-8",
        )

    print(f"Wrote {output_path}")
    if args.write_asset_alias:
        print(f"Wrote {output_path.parent / snapshot_name_for_lst(oracle_snapshot['lst_id'])}")
    if not args.skip_simulation:
        print(f"Wrote {ARTIFACTS_DIR / 'stress_scenario.json'}")


if __name__ == "__main__":
    main()
