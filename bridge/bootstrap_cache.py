"""Bootstrap a bridge cache payload from the public dashboard snapshot."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT_PATH = ROOT / "dashboard" / "public" / "data" / "oracle_state.json"
OUTPUT_PATH = ROOT / "bridge" / "data" / "latest_raw.json"

FEEDS = {
    "msol_usd": "0xc2289a6a43d2ce91c6f55caec370f4acc38a2ed477f58813334c6d03749ff2a4",
    "sol_usd": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
}

# When bootstrapping from a stale snapshot, Marinade rate may not be present in
# the snapshot.  This fallback keeps the pipeline deterministic and flags the
# source for the dashboard.
FALLBACK_MARINADE_RATE = 1.17


def main() -> None:
    snapshot = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))

    marinade_rate = float(
        snapshot.get("marinade_msol_sol_rate") or FALLBACK_MARINADE_RATE
    )
    marinade_source = (
        snapshot.get("marinade_rate_source")
        or ("snapshot" if snapshot.get("marinade_msol_sol_rate") else "fallback-hardcoded")
    )

    history = []
    for point in snapshot.get("history", []):
        sol_price = float(point["sol_price"])
        msol_price = float(point["msol_price"])
        if sol_price and marinade_rate:
            peg_deviation = (msol_price / sol_price) / marinade_rate - 1.0
        else:
            peg_deviation = None
        history.append(
            {
                "timestamp": int(point["timestamp"]),
                "msol_usd_price": msol_price,
                "sol_usd_price": sol_price,
                "msol_confidence": 0.0,
                "sol_confidence": 0.0,
                "msol_sol_ratio": msol_price / sol_price if sol_price else None,
                "msol_sol_spread_pct": float(point["spread_pct"]),
                "peg_deviation": peg_deviation,
            }
        )

    msol_price_latest = float(snapshot.get("msol_price", 0.0))
    sol_price_latest = float(snapshot.get("sol_price", 0.0))
    peg_deviation_latest = (
        (msol_price_latest / sol_price_latest) / marinade_rate - 1.0
        if sol_price_latest and marinade_rate
        else None
    )

    payload = {
        "source": snapshot.get("source", "dashboard-snapshot"),
        "bridge_timestamp": snapshot.get("bridge_timestamp", snapshot.get("updated_at_iso")),
        "feeds": FEEDS,
        "msol_usd": {
            "price": msol_price_latest,
            "confidence": 0.0,
            "publish_time": int(snapshot.get("timestamp", 0)),
        },
        "sol_usd": {
            "price": sol_price_latest,
            "confidence": 0.0,
            "publish_time": int(snapshot.get("timestamp", 0)),
        },
        "marinade_msol_sol_rate": marinade_rate,
        "marinade_rate_source": marinade_source,
        "derived": {
            "msol_sol_ratio": (
                msol_price_latest / sol_price_latest if sol_price_latest else None
            ),
            "msol_sol_spread_pct": float(snapshot.get("spread_pct", 0.0)),
            "peg_deviation_pct": peg_deviation_latest,
        },
        "history": history,
        "history_source": "dashboard_bootstrap",
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote bootstrap bridge cache to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
