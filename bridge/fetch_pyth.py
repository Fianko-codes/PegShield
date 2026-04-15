"""Fetch live and recent historical Pyth prices for the oracle bridge.

Also fetches Marinade's canonical mSOL -> SOL exchange rate so that downstream
risk models can compute the *true* peg deviation instead of the USD-denominated
spread (which is dominated by staking-yield accrual, not de-peg risk).
"""

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

# Marinade publishes the canonical mSOL -> SOL exchange rate via their REST API.
# This is the true intrinsic value of mSOL in SOL terms (drifts slowly upward
# as staking rewards accrue).  Market mSOL/SOL should track this rate; deviation
# from it is what actually constitutes a "de-peg".
MARINADE_PRICE_URL = os.getenv(
    "MARINADE_PRICE_URL",
    "https://api.marinade.finance/msol/price_sol",
)

# Conservative hard fallback if Marinade API is unreachable at startup.
# mSOL has traded between ~1.03 and ~1.36 SOL over its lifetime; 1.17 is a safe
# mid-range anchor that will not cause absurd peg_deviation values.
MARINADE_RATE_FALLBACK = 1.17

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


def compute_peg_deviation(
    msol_usd: float,
    sol_usd: float,
    marinade_rate: float | None,
) -> float | None:
    """Return (market_ratio / marinade_rate) - 1.

    A value of 0 means the market price of mSOL matches its intrinsic SOL value.
    A negative value means mSOL is trading BELOW Marinade's exchange rate — the
    actual definition of a de-peg event.
    """
    if not sol_usd or not marinade_rate:
        return None
    market_ratio = msol_usd / sol_usd
    return (market_ratio / marinade_rate) - 1.0


def fetch_marinade_msol_sol_rate(
    session: requests.Session,
    url: str = MARINADE_PRICE_URL,
) -> tuple[float, str]:
    """Fetch the live Marinade mSOL -> SOL exchange rate.

    Returns (rate, source_label).  On failure falls back to a conservative
    hardcoded rate so the pipeline stays functional — but the caller should
    record the source so the dashboard can flag when we are on fallback.
    """
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = session.get(url, timeout=10)
            response.raise_for_status()
            payload = response.json()

            # The endpoint can return either a bare number or an object such as
            # {"value": 1.17} depending on version.  Handle both forms.
            if isinstance(payload, (int, float)):
                rate = float(payload)
            elif isinstance(payload, dict):
                rate = float(
                    payload.get("value")
                    or payload.get("price")
                    or payload.get("msol_price")
                    or 0.0
                )
            else:
                raise ValueError(f"Unexpected Marinade response shape: {type(payload)}")

            # Sanity check: mSOL should be worth > 1 SOL and < 2 SOL for the
            # foreseeable future.  Anything outside this band is a parse bug.
            if not (1.0 <= rate <= 2.0):
                raise ValueError(f"Marinade rate {rate} outside sane bounds")

            return rate, "marinade-api"
        except Exception as exc:  # noqa: BLE001 — broad on purpose; log-and-retry
            last_error = exc
            time.sleep(0.5 * (attempt + 1))

    # All retries failed — use hardcoded fallback and mark the source clearly.
    print(
        f"WARN: Marinade rate fetch failed ({last_error}); falling back to "
        f"{MARINADE_RATE_FALLBACK}",
    )
    return MARINADE_RATE_FALLBACK, "fallback-hardcoded"


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
    marinade_rate: float | None,
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
        # msol_sol_spread_pct is DEPRECATED for risk calc — it measures USD
        # premium (dominated by staking yield), not the actual peg deviation.
        # Kept for backward compatibility with older snapshots.
        spread_pct = ((msol["price"] - sol["price"]) / sol["price"]) if sol["price"] else None
        peg_deviation = compute_peg_deviation(msol["price"], sol["price"], marinade_rate)

        history.append(
            {
                "timestamp": timestamp,
                "msol_usd_price": msol["price"],
                "sol_usd_price": sol["price"],
                "msol_confidence": msol["confidence"],
                "sol_confidence": sol["confidence"],
                "msol_sol_ratio": ratio,
                "msol_sol_spread_pct": spread_pct,   # deprecated, still emitted
                "peg_deviation": peg_deviation,      # PREFERRED risk signal
            }
        )

    return history


def build_output(
    latest_feeds: list[dict[str, Any]],
    history: list[dict[str, Any]],
    history_source: str,
    marinade_rate: float,
    marinade_source: str,
) -> dict[str, Any]:
    by_feed_id = {canonical_feed_id(item["id"]): item for item in latest_feeds}
    missing = [feed_id for feed_id in FEEDS.values() if canonical_feed_id(feed_id) not in by_feed_id]
    if missing:
        raise ValueError(f"Missing feed data for ids: {missing}")

    msol = normalize_price(by_feed_id[canonical_feed_id(FEEDS["msol_usd"])]["price"])
    sol = normalize_price(by_feed_id[canonical_feed_id(FEEDS["sol_usd"])]["price"])
    bridge_timestamp = datetime.now(UTC).isoformat()

    market_ratio = msol["price"] / sol["price"] if sol["price"] else None
    peg_deviation = compute_peg_deviation(msol["price"], sol["price"], marinade_rate)

    return {
        "source": "pyth-hermes",
        "bridge_timestamp": bridge_timestamp,
        "feeds": FEEDS,
        "msol_usd": msol,
        "sol_usd": sol,
        "marinade_msol_sol_rate": marinade_rate,
        "marinade_rate_source": marinade_source,
        "derived": {
            "msol_sol_ratio": market_ratio,
            "msol_sol_spread_pct": (
                (msol["price"] - sol["price"]) / sol["price"] if sol["price"] else None
            ),  # deprecated
            "peg_deviation_pct": peg_deviation,  # PREFERRED risk signal
        },
        "history": history,
        "history_source": history_source,
    }


def _enrich_history_with_peg_deviation(
    history: list[dict[str, Any]],
    marinade_rate: float,
) -> list[dict[str, Any]]:
    """Add peg_deviation to historical points that lack it (e.g. from cache)."""
    enriched = []
    for point in history:
        if "peg_deviation" not in point or point["peg_deviation"] is None:
            point = {
                **point,
                "peg_deviation": compute_peg_deviation(
                    float(point["msol_usd_price"]),
                    float(point["sol_usd_price"]),
                    marinade_rate,
                ),
            }
        enriched.append(point)
    return enriched


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
        marinade_rate, marinade_source = fetch_marinade_msol_sol_rate(session)
        latest_feeds = fetch_latest_price_feeds(session, hermes_url=args.hermes_url)
        try:
            history = fetch_historical_series(
                session,
                lookback_seconds=args.lookback_seconds,
                step_seconds=args.step_seconds,
                marinade_rate=marinade_rate,
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
            # Cached/fallback history may lack peg_deviation — backfill now.
            history = _enrich_history_with_peg_deviation(history, marinade_rate)

    payload = build_output(
        latest_feeds,
        history,
        history_source,
        marinade_rate=marinade_rate,
        marinade_source=marinade_source,
    )
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(
        f"Wrote live Pyth payload to {output_path} "
        f"(marinade_rate={marinade_rate:.6f} via {marinade_source})",
    )


if __name__ == "__main__":
    main()
