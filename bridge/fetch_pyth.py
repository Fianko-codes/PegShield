"""Fetch live and recent historical Pyth prices for the oracle bridge."""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests

DEFAULT_HERMES_URL = os.getenv("PYTH_HTTP_URL", "https://hermes.pyth.network")
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "data" / "latest_raw.json"
DEFAULT_DASHBOARD_SNAPSHOT = (
    Path(__file__).resolve().parent.parent / "dashboard" / "public" / "data" / "oracle_state.json"
)

FEEDS = {
    "msol_usd": "0xc2289a6a43d2ce91c6f55caec370f4acc38a2ed477f58813334c6d03749ff2a4",
    "sol_usd": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
}


def canonical_feed_id(feed_id: str) -> str:
    return feed_id.lower().removeprefix("0x")


def normalize_price(raw_price: dict[str, Any]) -> dict[str, Any]:
    price = raw_price["price"]
    expo = raw_price["expo"]
    scale = 10 ** int(expo)
    return {
        "price": int(price) * scale,
        "confidence": int(raw_price["conf"]) * scale,
        "publish_time": int(raw_price["publish_time"]),
    }


def fetch_latest_price_feeds(
    session: requests.Session,
    hermes_url: str = DEFAULT_HERMES_URL,
) -> list[dict[str, Any]]:
    response = session.get(
        f"{hermes_url}/api/latest_price_feeds",
        params=[("ids[]", feed_id) for feed_id in FEEDS.values()],
        timeout=15,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError("Unexpected Hermes response shape: expected a list")
    return payload


def fetch_price_feed_at_time(
    session: requests.Session,
    feed_id: str,
    publish_time: int,
    hermes_url: str = DEFAULT_HERMES_URL,
) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(5):
        response = session.get(
            f"{hermes_url}/api/get_price_feed",
            params={
                "id": feed_id,
                "publish_time": publish_time,
            },
            timeout=15,
        )
        if response.status_code != 429:
            response.raise_for_status()
            time.sleep(0.05)
            return response.json()

        last_error = requests.HTTPError(
            f"429 rate limit from Hermes for feed {feed_id} at {publish_time}",
            response=response,
        )
        time.sleep(0.5 * (attempt + 1))

    if last_error is not None:
        raise last_error
    raise RuntimeError("Unexpected empty retry state in fetch_price_feed_at_time")


def fetch_historical_series(
    session: requests.Session,
    lookback_seconds: int,
    step_seconds: int,
    hermes_url: str = DEFAULT_HERMES_URL,
) -> list[dict[str, Any]]:
    end_time = int(time.time()) // step_seconds * step_seconds
    start_time = end_time - lookback_seconds
    history: list[dict[str, Any]] = []

    for timestamp in range(start_time, end_time + 1, step_seconds):
        msol = normalize_price(
            fetch_price_feed_at_time(session, FEEDS["msol_usd"], timestamp, hermes_url)["price"]
        )
        sol = normalize_price(
            fetch_price_feed_at_time(session, FEEDS["sol_usd"], timestamp, hermes_url)["price"]
        )

        ratio = msol["price"] / sol["price"] if sol["price"] else None
        spread_pct = ((msol["price"] - sol["price"]) / sol["price"]) if sol["price"] else None

        history.append(
            {
                "timestamp": timestamp,
                "msol_usd_price": msol["price"],
                "sol_usd_price": sol["price"],
                "msol_confidence": msol["confidence"],
                "sol_confidence": sol["confidence"],
                "msol_sol_ratio": ratio,
                "msol_sol_spread_pct": spread_pct,
            }
        )

    return history


def build_output(
    latest_feeds: list[dict[str, Any]],
    history: list[dict[str, Any]],
    history_source: str,
) -> dict[str, Any]:
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
        "history": history,
        "history_source": history_source,
    }


def load_cached_history(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"No cached bridge payload available at {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    history = payload.get("history", [])
    if len(history) < 20:
        raise ValueError("Cached bridge payload does not contain enough historical samples")
    return history


def load_dashboard_snapshot_history(path: Path = DEFAULT_DASHBOARD_SNAPSHOT) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"No dashboard snapshot history available at {path}")

    payload = json.loads(path.read_text(encoding="utf-8"))
    history = payload.get("history", [])
    if len(history) < 20:
        raise ValueError("Dashboard snapshot does not contain enough historical samples")

    converted = []
    for point in history:
        sol_price = float(point["sol_price"])
        msol_price = float(point["msol_price"])
        converted.append(
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

    return converted


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch live and recent Pyth prices for mSOL and SOL.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--hermes-url", default=DEFAULT_HERMES_URL)
    parser.add_argument("--lookback-seconds", type=int, default=6000)
    parser.add_argument("--step-seconds", type=int, default=300)
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    history_source = "live"
    with requests.Session() as session:
        latest_feeds = fetch_latest_price_feeds(session, hermes_url=args.hermes_url)
        try:
            history = fetch_historical_series(
                session,
                lookback_seconds=args.lookback_seconds,
                step_seconds=args.step_seconds,
                hermes_url=args.hermes_url,
            )
        except requests.HTTPError as exc:
            if getattr(exc.response, "status_code", None) != 429:
                raise
            try:
                history = load_cached_history(output_path)
                history_source = "cache_fallback"
            except (FileNotFoundError, ValueError):
                history = load_dashboard_snapshot_history()
                history_source = "dashboard_snapshot_fallback"

    payload = build_output(latest_feeds, history, history_source)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote live Pyth payload to {output_path}")


if __name__ == "__main__":
    main()
