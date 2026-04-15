#!/usr/bin/env python3
"""Sync real oracle artifacts into dashboard/public for static hosting."""

from __future__ import annotations

import csv
import json
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DASHBOARD_PUBLIC = ROOT / "dashboard" / "public" / "data"
ORACLE_INPUT = ROOT / "core-engine" / "output" / "latest.json"
BRIDGE_INPUT = ROOT / "bridge" / "data" / "latest_raw.json"
SIM_INPUT = ROOT / "simulation" / "charts" / "stress_scenario.csv"
SIM_META_INPUT = ROOT / "simulation" / "charts" / "stress_scenario.meta.json"
ENV_INPUT = ROOT / ".env"


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


def build_oracle_snapshot() -> dict:
    oracle_payload = load_json(ORACLE_INPUT)
    bridge_payload = load_json(BRIDGE_INPUT)
    env = load_env(ENV_INPUT)

    history = [
        {
            "timestamp": int(point["timestamp"]),
            "spread_pct": float(point["msol_sol_spread_pct"]),
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

    snapshot = {
        "lst_id": oracle_payload["lst_id"],
        "theta": float(oracle_payload["theta"]),
        "sigma": float(oracle_payload["sigma"]),
        "regime_flag": int(oracle_payload["regime_flag"]),
        "suggested_ltv": float(oracle_payload["suggested_ltv"]),
        "z_score": float(oracle_payload["z_score"]),
        "mu": float(oracle_payload["mu"]),
        "adf_pvalue": float(oracle_payload["adf_pvalue"]),
        "is_stationary": bool(oracle_payload["is_stationary"]),
        "spread": float(oracle_payload["spread_pct"]),
        "spread_pct": float(oracle_payload["spread_pct"]),
        "spread_signal": oracle_payload.get("spread_signal", "unknown"),
        "peg_deviation_pct": oracle_payload.get("peg_deviation_pct"),
        "marinade_msol_sol_rate": oracle_payload.get("marinade_msol_sol_rate"),
        "marinade_rate_source": oracle_payload.get("marinade_rate_source", "unknown"),
        "timestamp": int(oracle_payload["timestamp"]),
        "updated_at_iso": iso_from_unix(int(oracle_payload["timestamp"])),
        "status": oracle_payload.get("status", "UNKNOWN"),
        "msol_price": float(oracle_payload["msol_price"]),
        "sol_price": float(oracle_payload["sol_price"]),
        "source": oracle_payload.get("meta", {}).get("source", bridge_payload.get("source", "unknown")),
        "bridge_timestamp": bridge_payload.get("bridge_timestamp"),
        "history_points": int(oracle_payload.get("meta", {}).get("history_points", len(history))),
        "history_source": bridge_payload.get("history_source", "unknown"),
        "step_seconds": int(oracle_payload.get("meta", {}).get("step_seconds", 0)),
        "baseline": oracle_payload.get("baseline", {}),
        "program_id": env.get("PROGRAM_ID", ""),
        "risk_state_pda": env.get(
            "MSOL_RISK_STATE_PDA",
            "7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo",
        ),
        "authority": env.get("ORACLE_AUTHORITY", ""),
        "network": "solana-devnet",
        "history": history,
    }
    return snapshot


def build_simulation_snapshot() -> dict:
    rows = list(csv.DictReader(SIM_INPUT.read_text(encoding="utf-8").splitlines()))
    replay_meta = {}
    if SIM_META_INPUT.exists():
        replay_meta = load_json(SIM_META_INPUT).get("replay", {})

    normalized_rows = []
    for row in rows:
        normalized_rows.append(
            {
                "timestamp": row["timestamp"],
                "spread_pct": float(row["spread_pct"]),
                "peg_deviation": (
                    float(row["peg_deviation"])
                    if row.get("peg_deviation") not in (None, "")
                    else None
                ),
                "theta": float(row["theta"]),
                "sigma": float(row["sigma"]),
                "z_score": float(row["z_score"]),
                "regime_flag": int(float(row["regime_flag"])),
                "ltv_with_oracle": float(row["ltv_with_oracle"]),
                "ltv_no_oracle": float(row["ltv_no_oracle"]),
                "shortfall_dynamic": float(
                    row.get("shortfall_dynamic", row["bad_debt_with_oracle"])
                ),
                "shortfall_static": float(
                    row.get("shortfall_static", row["bad_debt_no_oracle"])
                ),
                "bad_debt_with_oracle": float(row["bad_debt_with_oracle"]),
                "bad_debt_no_oracle": float(row["bad_debt_no_oracle"]),
            }
        )

    final_row = normalized_rows[-1] if normalized_rows else None
    summary = {
        "points": normalized_rows,
        "replay": replay_meta,
        "summary": {
            "row_count": len(normalized_rows),
            "max_spread_pct": max((row["spread_pct"] for row in normalized_rows), default=0.0),
            "min_spread_pct": min((row["spread_pct"] for row in normalized_rows), default=0.0),
            "max_peg_deviation": max(
                (row["peg_deviation"] for row in normalized_rows if row["peg_deviation"] is not None),
                default=0.0,
            ),
            "min_peg_deviation": min(
                (row["peg_deviation"] for row in normalized_rows if row["peg_deviation"] is not None),
                default=0.0,
            ),
            "max_z_score": max((row["z_score"] for row in normalized_rows), default=0.0),
            "critical_rows": sum(1 for row in normalized_rows if row["regime_flag"] == 1),
            "final_dynamic_ltv": final_row["ltv_with_oracle"] if final_row else 0.0,
            "final_static_ltv": final_row["ltv_no_oracle"] if final_row else 0.0,
        },
    }
    return summary


def main() -> None:
    DASHBOARD_PUBLIC.mkdir(parents=True, exist_ok=True)
    oracle_snapshot = build_oracle_snapshot()
    simulation_snapshot = build_simulation_snapshot()

    (DASHBOARD_PUBLIC / "oracle_state.json").write_text(
        json.dumps(oracle_snapshot, indent=2),
        encoding="utf-8",
    )
    (DASHBOARD_PUBLIC / "stress_scenario.json").write_text(
        json.dumps(simulation_snapshot, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {DASHBOARD_PUBLIC / 'oracle_state.json'}")
    print(f"Wrote {DASHBOARD_PUBLIC / 'stress_scenario.json'}")


if __name__ == "__main__":
    main()
