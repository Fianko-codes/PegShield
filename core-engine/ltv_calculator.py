"""LTV calculation from calibrated peg and liquidity-risk signals."""

from __future__ import annotations

from typing import Any

CF_BASE = 0.80
LTV_FLOOR = 0.40
LTV_CAP = CF_BASE
MAX_LIQUIDITY_HAIRCUT = 0.30
MAX_DATA_QUALITY_HAIRCUT = 0.15


def _bounded_float(value: Any, *, lower: float = 0.0, upper: float | None = None) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed < lower:
        parsed = lower
    if upper is not None and parsed > upper:
        parsed = upper
    return parsed


def _linear_severity(value: float | None, *, start: float, full: float) -> float:
    if value is None or value <= start:
        return 0.0
    if value >= full:
        return 1.0
    return (value - start) / (full - start)


def compute_liquidity_risk(metrics: dict[str, Any] | None) -> dict[str, Any]:
    """Convert optional liquidity metrics into a bounded LTV haircut.

    Expected inputs are intentionally generic so the bridge can source them from
    DEX aggregators, risk dashboards, or protocol-specific liquidator models.
    Missing inputs are neutral for backward compatibility with existing payloads.
    """
    metrics = metrics or {}

    exit_liquidity_usd = _bounded_float(metrics.get("exit_liquidity_usd"))
    target_exit_usd = _bounded_float(metrics.get("target_exit_usd"))
    slippage_bps = _bounded_float(metrics.get("slippage_bps"))
    pool_imbalance_pct = _bounded_float(metrics.get("pool_imbalance_pct"), upper=1.0)
    withdrawal_delay_seconds = _bounded_float(metrics.get("withdrawal_delay_seconds"))
    concentration_pct = _bounded_float(
        metrics.get("top_holder_concentration_pct", metrics.get("liquidity_concentration_pct")),
        upper=1.0,
    )

    depth_shortfall = 0.0
    if exit_liquidity_usd is not None and target_exit_usd and target_exit_usd > 0:
        depth_shortfall = 1.0 - min(exit_liquidity_usd / target_exit_usd, 1.0)

    components = {
        "depth_shortfall": round(depth_shortfall, 4),
        "slippage": round(_linear_severity(slippage_bps, start=50.0, full=1_000.0), 4),
        "pool_imbalance": round(_linear_severity(pool_imbalance_pct, start=0.65, full=0.95), 4),
        "withdrawal_delay": round(
            _linear_severity(withdrawal_delay_seconds, start=3 * 86_400, full=14 * 86_400),
            4,
        ),
        "concentration": round(_linear_severity(concentration_pct, start=0.25, full=0.80), 4),
    }
    weights = {
        "slippage": 0.35,
        "depth_shortfall": 0.25,
        "pool_imbalance": 0.15,
        "withdrawal_delay": 0.15,
        "concentration": 0.10,
    }
    score = sum(components[name] * weight for name, weight in weights.items())
    haircut = min(MAX_LIQUIDITY_HAIRCUT, score * MAX_LIQUIDITY_HAIRCUT)

    if not metrics:
        status = "UNKNOWN"
    elif score >= 0.70:
        status = "SEVERE"
    elif score >= 0.35:
        status = "STRESSED"
    else:
        status = "NORMAL"

    return {
        "status": status,
        "score": round(float(score), 4),
        "haircut": round(float(haircut), 4),
        "components": components,
        "inputs": {
            "exit_liquidity_usd": exit_liquidity_usd,
            "target_exit_usd": target_exit_usd,
            "slippage_bps": slippage_bps,
            "pool_imbalance_pct": pool_imbalance_pct,
            "withdrawal_delay_seconds": withdrawal_delay_seconds,
            "concentration_pct": concentration_pct,
        },
    }


def _confidence_ratio(price: Any, confidence: Any) -> float | None:
    price_value = _bounded_float(price)
    confidence_value = _bounded_float(confidence)
    if price_value is None or confidence_value is None or price_value <= 0:
        return None
    return confidence_value / price_value


def compute_data_quality_risk(
    *,
    latest_row: dict[str, Any],
    bridge_payload: dict[str, Any],
    liquidity_metrics: dict[str, Any] | None,
) -> dict[str, Any]:
    """Convert oracle/source uncertainty into a bounded LTV haircut.

    This is deliberately separate from market peg risk. A lender should tighten
    when the model's inputs are degraded even if the latest peg point is calm.
    """
    asset_price = latest_row.get("asset_usd_price", latest_row.get("msol_usd_price"))
    asset_confidence = latest_row.get("asset_confidence", latest_row.get("msol_confidence"))
    sol_price = latest_row.get("sol_usd_price")
    sol_confidence = latest_row.get("sol_confidence")
    asset_confidence_ratio = _confidence_ratio(asset_price, asset_confidence)
    sol_confidence_ratio = _confidence_ratio(sol_price, sol_confidence)
    max_confidence_ratio = max(
        [ratio for ratio in (asset_confidence_ratio, sol_confidence_ratio) if ratio is not None],
        default=None,
    )

    history_source = str(bridge_payload.get("history_source", "unknown")).lower()
    reference_rate_source = str(
        bridge_payload.get(
            "reference_rate_source",
            bridge_payload.get("marinade_rate_source", "unknown"),
        )
    ).lower()
    has_liquidity_metrics = bool(liquidity_metrics)

    components = {
        "price_confidence": round(
            _linear_severity(max_confidence_ratio, start=0.005, full=0.03),
            4,
        ),
        "history_fallback": 1.0 if "fallback" in history_source else 0.0,
        "reference_rate_fallback": 1.0 if "fallback" in reference_rate_source else 0.0,
        "missing_liquidity_depth": 0.0 if has_liquidity_metrics else 1.0,
    }
    weights = {
        "price_confidence": 0.35,
        "history_fallback": 0.30,
        "reference_rate_fallback": 0.20,
        "missing_liquidity_depth": 0.15,
    }
    score = sum(components[name] * weight for name, weight in weights.items())
    haircut = min(MAX_DATA_QUALITY_HAIRCUT, score * MAX_DATA_QUALITY_HAIRCUT)

    if score >= 0.70:
        status = "DEGRADED"
    elif score > 0:
        status = "WATCH"
    else:
        status = "NORMAL"

    return {
        "status": status,
        "score": round(float(score), 4),
        "haircut": round(float(haircut), 4),
        "components": components,
        "inputs": {
            "asset_confidence_ratio": (
                round(asset_confidence_ratio, 6) if asset_confidence_ratio is not None else None
            ),
            "sol_confidence_ratio": (
                round(sol_confidence_ratio, 6) if sol_confidence_ratio is not None else None
            ),
            "history_source": history_source,
            "reference_rate_source": reference_rate_source,
            "has_liquidity_metrics": has_liquidity_metrics,
        },
    }


def compute_ltv(
    theta: float,
    sigma: float,
    regime_flag: int,
    baseline: dict[str, Any],
    liquidity_risk: dict[str, Any] | None = None,
    data_quality_risk: dict[str, Any] | None = None,
) -> float:
    if regime_flag == 1:
        return LTV_FLOOR

    theta_ref = max(float(baseline["theta_avg"]), 1e-6)
    sigma_ref = max(float(baseline["sigma_avg"]), 1e-6)
    sigma = max(float(sigma), 1e-6)

    ratio = (theta / theta_ref) * (sigma_ref / sigma)
    adjusted = CF_BASE * ratio
    adjusted = max(LTV_FLOOR, min(LTV_CAP, adjusted))
    liquidity_haircut = float((liquidity_risk or {}).get("haircut", 0.0))
    data_quality_haircut = float((data_quality_risk or {}).get("haircut", 0.0))
    adjusted -= max(0.0, min(MAX_LIQUIDITY_HAIRCUT, liquidity_haircut))
    adjusted -= max(0.0, min(MAX_DATA_QUALITY_HAIRCUT, data_quality_haircut))
    adjusted = max(LTV_FLOOR, min(LTV_CAP, adjusted))
    return round(float(adjusted), 4)
