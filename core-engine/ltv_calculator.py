"""LTV calculation from calibrated OU signals."""

from __future__ import annotations

from typing import Any

CF_BASE = 0.80
LTV_FLOOR = 0.40
LTV_CAP = CF_BASE


def compute_ltv(theta: float, sigma: float, regime_flag: int, baseline: dict[str, Any]) -> float:
    if regime_flag == 1:
        return LTV_FLOOR

    theta_ref = max(float(baseline["theta_avg"]), 1e-6)
    sigma_ref = max(float(baseline["sigma_avg"]), 1e-6)
    sigma = max(float(sigma), 1e-6)

    ratio = (theta / theta_ref) * (sigma_ref / sigma)
    adjusted = CF_BASE * ratio
    adjusted = max(LTV_FLOOR, min(LTV_CAP, adjusted))
    return round(float(adjusted), 4)
