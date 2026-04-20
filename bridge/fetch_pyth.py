"""Fetch live and recent historical Pyth prices for the oracle bridge.

Also fetches Marinade's canonical mSOL -> SOL exchange rate so that downstream
risk models can compute the *true* peg deviation instead of the USD-denominated
spread (which is dominated by staking-yield accrual, not de-peg risk).
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import requests
from assets import AssetConfig, resolve_asset_config

DEFAULT_HERMES_URL = os.getenv("PYTH_HTTP_URL", "https://hermes.pyth.network")
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "data" / "latest_raw.json"
DEFAULT_DASHBOARD_SNAPSHOT = (
    Path(__file__).resolve().parent.parent / "dashboard" / "public" / "data" / "oracle_state.json"
)
DEFAULT_ASSET = os.getenv("LST_ASSET", "mSOL")

MARINADE_PRICE_URL = os.getenv(
    "MARINADE_PRICE_URL",
    "https://api.marinade.finance/msol/price_sol",
)
JITO_STAKE_POOL_STATS_URL = os.getenv(
    "JITO_STAKE_POOL_STATS_URL",
    "https://kobe.mainnet.jito.network/api/v1/stake_pool_stats",
)
SOLBLAZE_STAKE_POOL_ACCOUNT = os.getenv(
    "SOLBLAZE_STAKE_POOL_ACCOUNT",
    "stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi",
)
SOLBLAZE_RPC_URL = os.getenv(
    "SOLBLAZE_RPC_URL",
    os.getenv("SOLANA_MAINNET_RPC_URL", "https://api.mainnet-beta.solana.com"),
)

FEEDS = {
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
    asset_usd: float,
    sol_usd: float,
    reference_rate: float | None,
) -> float | None:
    """Return (market_ratio / reference_rate) - 1.

    A value of 0 means the market price of the LST matches its intrinsic SOL
    exchange rate. A negative value means the LST is trading BELOW the canonical
    staking exchange rate — the actual definition of a de-peg event.
    """
    if not sol_usd or not reference_rate:
        return None
    market_ratio = asset_usd / sol_usd
    return (market_ratio / reference_rate) - 1.0


def feed_map(asset_config: AssetConfig) -> dict[str, str]:
    return {
        "asset_usd": asset_config.market_feed_id,
        "sol_usd": FEEDS["sol_usd"],
    }


def fetch_marinade_msol_sol_rate(
    session: requests.Session,
    url: str = MARINADE_PRICE_URL,
    fallback_rate: float = 1.17,
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
        f"{fallback_rate}",
    )
    return fallback_rate, "fallback-hardcoded"


def _latest_series_value(series: list[dict[str, Any]], label: str) -> float:
    if not series:
        raise ValueError(f"Missing {label} series in Jito stake pool stats")
    latest = max(series, key=lambda item: str(item.get("date", "")))
    return float(latest["data"])


def fetch_jito_jitosol_sol_rate(
    session: requests.Session,
    url: str = JITO_STAKE_POOL_STATS_URL,
    fallback_rate: float = 1.27,
) -> tuple[float, str]:
    """Fetch the live JitoSOL -> SOL exchange rate from Jito's stake-pool stats API."""
    last_error: Exception | None = None
    now = datetime.now(UTC).replace(microsecond=0)
    request_body = {
        "bucket_type": "Daily",
        "range_filter": {
            "start": (now - timedelta(days=3)).isoformat().replace("+00:00", "Z"),
            "end": now.isoformat().replace("+00:00", "Z"),
        },
        "sort_by": {
            "field": "BlockTime",
            "order": "Asc",
        },
    }

    for attempt in range(3):
        try:
            response = session.post(url, json=request_body, timeout=15)
            response.raise_for_status()
            payload = response.json()

            tvl_lamports = _latest_series_value(payload.get("tvl", []), "tvl")
            supply = _latest_series_value(payload.get("supply", []), "supply")
            if supply <= 0:
                raise ValueError("Jito supply must be positive")

            rate = (tvl_lamports / 1_000_000_000) / supply
            if not (1.0 <= rate <= 2.0):
                raise ValueError(f"Jito rate {rate} outside sane bounds")

            return rate, "jito-kobe-api"
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(0.5 * (attempt + 1))

    print(
        f"WARN: Jito rate fetch failed ({last_error}); falling back to "
        f"{fallback_rate}",
    )
    return fallback_rate, "fallback-hardcoded"


def fetch_reference_rate(
    session: requests.Session,
    asset_config: AssetConfig,
) -> tuple[float, str]:
    if asset_config.reference_rate_kind == "marinade":
        return fetch_marinade_msol_sol_rate(
            session,
            fallback_rate=asset_config.reference_rate_fallback,
        )
    if asset_config.reference_rate_kind == "jito":
        return fetch_jito_jitosol_sol_rate(
            session,
            fallback_rate=asset_config.reference_rate_fallback,
        )
    if asset_config.reference_rate_kind == "solblaze":
        return fetch_solblaze_bsol_sol_rate(
            session,
            fallback_rate=asset_config.reference_rate_fallback,
        )
    raise ValueError(f"Unsupported reference rate kind: {asset_config.reference_rate_kind}")


def _decode_borsh_u64(buffer: bytes, offset: int) -> int:
    return int.from_bytes(buffer[offset:offset + 8], byteorder="little", signed=False)


def fetch_solblaze_bsol_sol_rate(
    session: requests.Session,
    rpc_url: str = SOLBLAZE_RPC_URL,
    stake_pool_account: str = SOLBLAZE_STAKE_POOL_ACCOUNT,
    fallback_rate: float = 1.18,
) -> tuple[float, str]:
    """Fetch the live bSOL -> SOL exchange rate from the BlazeStake stake-pool account.

    The official BlazeStake docs publish the stake-pool account, and SPL stake-pool
    accounts are Borsh-serialized. We only need `total_lamports` and
    `pool_token_supply` from the serialized `StakePool` struct to derive the
    redemption rate.
    """
    last_error: Exception | None = None
    request_body = {
        "jsonrpc": "2.0",
        "id": "pegshield-solblaze-stake-pool",
        "method": "getAccountInfo",
        "params": [
            stake_pool_account,
            {
                "encoding": "base64",
                "commitment": "confirmed",
            },
        ],
    }

    for attempt in range(3):
        try:
            response = session.post(rpc_url, json=request_body, timeout=15)
            response.raise_for_status()
            payload = response.json()
            value = payload.get("result", {}).get("value")
            if not value:
                raise ValueError("SolBlaze stake-pool account not found")

            encoded_data = value.get("data")
            if not isinstance(encoded_data, list) or len(encoded_data) < 1:
                raise ValueError("Unexpected SolBlaze account payload shape")

            account_bytes = base64.b64decode(encoded_data[0])
            if len(account_bytes) < 274:
                raise ValueError("SolBlaze stake-pool account too small to decode")

            account_type = account_bytes[0]
            if account_type != 1:
                raise ValueError(f"Unexpected stake-pool account type: {account_type}")

            total_lamports = _decode_borsh_u64(account_bytes, 258)
            pool_token_supply = _decode_borsh_u64(account_bytes, 266)
            if pool_token_supply <= 0:
                raise ValueError("SolBlaze pool token supply must be positive")

            rate = total_lamports / pool_token_supply
            if not (1.0 <= rate <= 2.0):
                raise ValueError(f"SolBlaze rate {rate} outside sane bounds")

            return rate, "solblaze-stake-pool-rpc"
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(0.5 * (attempt + 1))

    print(
        f"WARN: SolBlaze rate fetch failed ({last_error}); falling back to "
        f"{fallback_rate}",
    )
    return fallback_rate, "fallback-hardcoded"


def fetch_latest_price_feeds(
    session: requests.Session,
    feeds: dict[str, str],
    hermes_url: str = DEFAULT_HERMES_URL,
) -> list[dict[str, Any]]:
    response = session.get(
        f"{hermes_url}/api/latest_price_feeds",
        params=[("ids[]", feed_id) for feed_id in feeds.values()],
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
    asset_config: AssetConfig,
    lookback_seconds: int,
    step_seconds: int,
    reference_rate: float | None,
    hermes_url: str = DEFAULT_HERMES_URL,
) -> list[dict[str, Any]]:
    feeds = feed_map(asset_config)
    end_time = int(time.time()) // step_seconds * step_seconds
    start_time = end_time - lookback_seconds
    history: list[dict[str, Any]] = []

    for timestamp in range(start_time, end_time + 1, step_seconds):
        asset = normalize_price(
            fetch_price_feed_at_time(session, feeds["asset_usd"], timestamp, hermes_url)["price"]
        )
        sol = normalize_price(
            fetch_price_feed_at_time(session, feeds["sol_usd"], timestamp, hermes_url)["price"]
        )

        ratio = asset["price"] / sol["price"] if sol["price"] else None
        # asset_sol_spread_pct is DEPRECATED for risk calc — it measures USD
        # premium (dominated by staking yield), not the actual peg deviation.
        # Kept for backward compatibility with older snapshots.
        spread_pct = ((asset["price"] - sol["price"]) / sol["price"]) if sol["price"] else None
        peg_deviation = compute_peg_deviation(asset["price"], sol["price"], reference_rate)

        history.append(
            {
                "timestamp": timestamp,
                "asset_usd_price": asset["price"],
                "sol_usd_price": sol["price"],
                "asset_confidence": asset["confidence"],
                "sol_confidence": sol["confidence"],
                "asset_sol_ratio": ratio,
                "asset_sol_spread_pct": spread_pct,
                "msol_usd_price": asset["price"],        # legacy alias
                "msol_confidence": asset["confidence"],  # legacy alias
                "msol_sol_ratio": ratio,                 # legacy alias
                "msol_sol_spread_pct": spread_pct,       # legacy alias
                "peg_deviation": peg_deviation,      # PREFERRED risk signal
            }
        )

    return history


def build_output(
    asset_config: AssetConfig,
    latest_feeds: list[dict[str, Any]],
    history: list[dict[str, Any]],
    history_source: str,
    reference_rate: float,
    reference_rate_source: str,
) -> dict[str, Any]:
    feeds = feed_map(asset_config)
    by_feed_id = {canonical_feed_id(item["id"]): item for item in latest_feeds}
    missing = [feed_id for feed_id in feeds.values() if canonical_feed_id(feed_id) not in by_feed_id]
    if missing:
        raise ValueError(f"Missing feed data for ids: {missing}")

    asset = normalize_price(by_feed_id[canonical_feed_id(feeds["asset_usd"])]["price"])
    sol = normalize_price(by_feed_id[canonical_feed_id(feeds["sol_usd"])]["price"])
    bridge_timestamp = datetime.now(UTC).isoformat()

    market_ratio = asset["price"] / sol["price"] if sol["price"] else None
    peg_deviation = compute_peg_deviation(asset["price"], sol["price"], reference_rate)

    payload = {
        "source": "pyth-hermes",
        "lst_id": asset_config.lst_id,
        "asset_symbol": asset_config.asset_symbol,
        "asset_display_name": asset_config.asset_name,
        "base_symbol": asset_config.base_symbol,
        "bridge_timestamp": bridge_timestamp,
        "feeds": feeds,
        "asset_usd": asset,
        "sol_usd": sol,
        "asset_sol_reference_rate": reference_rate,
        "reference_rate_source": reference_rate_source,
        "derived": {
            "msol_sol_ratio": market_ratio,
            "msol_sol_spread_pct": (
                (asset["price"] - sol["price"]) / sol["price"] if sol["price"] else None
            ),
            "asset_sol_ratio": market_ratio,
            "asset_sol_spread_pct": (
                (asset["price"] - sol["price"]) / sol["price"] if sol["price"] else None
            ),
            "peg_deviation_pct": peg_deviation,  # PREFERRED risk signal
        },
        "history": history,
        "history_source": history_source,
    }
    if asset_config.reference_rate_kind == "marinade":
        payload["marinade_msol_sol_rate"] = reference_rate
        payload["marinade_rate_source"] = reference_rate_source
    return payload


def _enrich_history_with_peg_deviation(
    history: list[dict[str, Any]],
    reference_rate: float,
) -> list[dict[str, Any]]:
    """Add peg_deviation to historical points that lack it (e.g. from cache)."""
    enriched = []
    for point in history:
        asset_price = point.get("asset_usd_price", point.get("msol_usd_price"))
        if "peg_deviation" not in point or point["peg_deviation"] is None:
            point = {
                **point,
                "peg_deviation": compute_peg_deviation(
                    float(asset_price),
                    float(point["sol_usd_price"]),
                    reference_rate,
                ),
            }
        if "asset_usd_price" not in point and asset_price is not None:
            point = {
                **point,
                "asset_usd_price": float(asset_price),
                "asset_confidence": float(point.get("msol_confidence", 0.0)),
                "asset_sol_ratio": point.get("msol_sol_ratio"),
                "asset_sol_spread_pct": point.get("msol_sol_spread_pct"),
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
        asset_price = float(point.get("asset_price", point["msol_price"]))
        converted.append(
            {
                "timestamp": int(point["timestamp"]),
                "asset_usd_price": asset_price,
                "sol_usd_price": sol_price,
                "asset_confidence": 0.0,
                "sol_confidence": 0.0,
                "asset_sol_ratio": asset_price / sol_price if sol_price else None,
                "asset_sol_spread_pct": float(point["spread_pct"]),
                "msol_usd_price": asset_price,
                "msol_confidence": 0.0,
                "msol_sol_ratio": asset_price / sol_price if sol_price else None,
                "msol_sol_spread_pct": float(point["spread_pct"]),
            }
        )

    return converted


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch live and recent Pyth prices for a supported Solana LST and SOL.",
    )
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--hermes-url", default=DEFAULT_HERMES_URL)
    parser.add_argument("--lookback-seconds", type=int, default=6000)
    parser.add_argument("--step-seconds", type=int, default=300)
    parser.add_argument("--asset", default=DEFAULT_ASSET)
    parser.add_argument("--lst-id", default=os.getenv("LST_ID"))
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    asset_config = resolve_asset_config(args.asset, args.lst_id)

    history_source = "live"
    with requests.Session() as session:
        reference_rate, reference_rate_source = fetch_reference_rate(session, asset_config)
        latest_feeds = fetch_latest_price_feeds(
            session,
            feed_map(asset_config),
            hermes_url=args.hermes_url,
        )
        try:
            history = fetch_historical_series(
                session,
                asset_config,
                lookback_seconds=args.lookback_seconds,
                step_seconds=args.step_seconds,
                reference_rate=reference_rate,
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
            history = _enrich_history_with_peg_deviation(history, reference_rate)

    payload = build_output(
        asset_config,
        latest_feeds,
        history,
        history_source,
        reference_rate=reference_rate,
        reference_rate_source=reference_rate_source,
    )
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(
        f"Wrote live Pyth payload to {output_path} "
        f"({asset_config.asset_symbol} reference_rate={reference_rate:.6f} via {reference_rate_source})",
    )


if __name__ == "__main__":
    main()
