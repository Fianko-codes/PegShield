"""Fetch live Pyth prices for the oracle bridge.

This module only handles external market data retrieval and normalization.
It does not perform any risk scoring or LTV logic.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests

DEFAULT_HERMES_URL = os.getenv("PYTH_HTTP_URL", "https://hermes.pyth.network")
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "data" / "latest_raw.json"

# Devnet-compatible IDs from the project plan.
FEEDS = {
    "msol_usd": "0xc2289a6a43d2ce91c6f55caec370f4acc38a2ed477f58813334c6d03749ff2a4",
    "sol_usd": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
}


def canonical_feed_id(feed_id: str) -> str:
    return feed_id.lower().removeprefix("0x")


def normalize_price(raw_price: dict[str, Any]) -> dict[str, Any]:
    price = raw_price["price"]
    expo = raw_price["expo"]
    return {
        "price": int(price) * (10 ** int(expo)),
        "confidence": int(raw_price["conf"]) * (10 ** int(expo)),
        "publish_time": int(raw_price["publish_time"]),
    }


def fetch_latest_price_feeds(
    hermes_url: str = DEFAULT_HERMES_URL,
) -> list[dict[str, Any]]:
    response = requests.get(
        f"{hermes_url}/api/latest_price_feeds",
        params=[("ids[]", feed_id) for feed_id in FEEDS.values()],
        timeout=15,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError("Unexpected Hermes response shape: expected a list")
    return payload


def build_output(latest_feeds: list[dict[str, Any]]) -> dict[str, Any]:
    by_feed_id = {canonical_feed_id(item["id"]): item for item in latest_feeds}
    missing = [feed_id for feed_id in FEEDS.values() if canonical_feed_id(feed_id) not in by_feed_id]
    if missing:
        raise ValueError(f"Missing feed data for ids: {missing}")

    msol = normalize_price(by_feed_id[canonical_feed_id(FEEDS["msol_usd"])]["price"])
    sol = normalize_price(by_feed_id[canonical_feed_id(FEEDS["sol_usd"])]["price"])

    bridge_timestamp = datetime.now(UTC).isoformat()

    return {
        "source": "pyth-hermes",
        "bridge_timestamp": bridge_timestamp,
        "feeds": FEEDS,
        "msol_usd": msol,
        "sol_usd": sol,
        "derived": {
            "msol_sol_ratio": msol["price"] / sol["price"] if sol["price"] else None,
            "msol_sol_spread_pct": (
                (msol["price"] - sol["price"]) / sol["price"] if sol["price"] else None
            ),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch latest Pyth prices for mSOL and SOL.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--hermes-url", default=DEFAULT_HERMES_URL)
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    latest_feeds = fetch_latest_price_feeds(hermes_url=args.hermes_url)
    payload = build_output(latest_feeds)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote live Pyth payload to {output_path}")


if __name__ == "__main__":
    main()
