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


def main() -> None:
    snapshot = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    history = []

    for point in snapshot.get("history", []):
        sol_price = float(point["sol_price"])
        msol_price = float(point["msol_price"])
        history.append(
            {
                "timestamp": int(point["timestamp"]),
                "msol_usd_price": msol_price,
                "sol_usd_price": sol_price,
                "msol_confidence": 0.0,
                "sol_confidence": 0.0,
                "msol_sol_ratio": msol_price / sol_price if sol_price else None,
                "msol_sol_spread_pct": float(point["spread_pct"]),
            }
        )

    payload = {
        "source": snapshot.get("source", "dashboard-snapshot"),
        "bridge_timestamp": snapshot.get("bridge_timestamp", snapshot.get("updated_at_iso")),
        "feeds": FEEDS,
        "msol_usd": {
            "price": float(snapshot.get("msol_price", 0.0)),
            "confidence": 0.0,
            "publish_time": int(snapshot.get("timestamp", 0)),
        },
        "sol_usd": {
            "price": float(snapshot.get("sol_price", 0.0)),
            "confidence": 0.0,
            "publish_time": int(snapshot.get("timestamp", 0)),
        },
        "derived": {
            "msol_sol_ratio": (
                float(snapshot.get("msol_price", 0.0)) / float(snapshot.get("sol_price", 1.0))
                if float(snapshot.get("sol_price", 0.0))
                else None
            ),
            "msol_sol_spread_pct": float(snapshot.get("spread_pct", 0.0)),
        },
        "history": history,
        "history_source": "dashboard_bootstrap",
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote bootstrap bridge cache to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
