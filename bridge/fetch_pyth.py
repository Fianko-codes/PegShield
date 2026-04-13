"""Pyth fetch bridge scaffold.

This module is intentionally limited to data access concerns. The risk model
and any derived scoring remain outside this file.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import requests

DEFAULT_HERMES_URL = os.getenv("PYTH_HTTP_URL", "https://hermes.pyth.network")
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "data" / "latest_raw.json"

FEEDS = {
    "msol": "REPLACE_WITH_MSOL_FEED_ID",
    "sol": "REPLACE_WITH_SOL_FEED_ID",
}


def fetch_latest_prices(hermes_url: str = DEFAULT_HERMES_URL) -> dict[str, Any]:
    """Fetches the latest Pyth price payloads for configured feeds.

    This is a scaffold only. Feed IDs and response parsing still need to be
    finalized against the chosen Hermes endpoint.
    """
    payload: dict[str, Any] = {
        "hermes_url": hermes_url,
        "feeds": FEEDS,
        "status": "scaffold",
        "message": "Live Pyth parsing is not implemented yet.",
    }

    # Keep one real request in place so the integration surface is obvious.
    response = requests.get(f"{hermes_url}/v2/updates/price/latest", timeout=10)
    payload["http_status"] = response.status_code
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch latest Pyth data scaffold.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--hermes-url", default=DEFAULT_HERMES_URL)
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = fetch_latest_prices(hermes_url=args.hermes_url)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote scaffold payload to {output_path}")


if __name__ == "__main__":
    main()
