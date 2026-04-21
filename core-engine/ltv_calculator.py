"""LTV calculation from calibrated peg and liquidity-risk signals."""

from __future__ import annotations

from typing import Any

CF_BASE = 0.80
LTV_FLOOR = 0.40
LTV_CAP = CF_BASE
MAX_LIQUIDITY_HAIRCUT = 0.30


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


def compute_ltv(
    theta: float,
    sigma: float,
    regime_flag: int,
    baseline: dict[str, Any],
    liquidity_risk: dict[str, Any] | None = None,
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
    adjusted -= max(0.0, min(MAX_LIQUIDITY_HAIRCUT, liquidity_haircut))
    adjusted = max(LTV_FLOOR, min(LTV_CAP, adjusted))
    return round(float(adjusted), 4)
