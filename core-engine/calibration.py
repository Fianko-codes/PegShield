"""Derive baseline OU statistics from rolling historical windows."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from ou_model import estimate_ou_params


def derive_baseline(
    spread: pd.Series,
    dt_seconds: int,
    min_window_points: int = 20,
) -> dict[str, Any]:
    clean = spread.dropna().astype(float).reset_index(drop=True)
    if len(clean) < min_window_points:
        params = estimate_ou_params(clean, dt_seconds)
        return {
            "theta_avg": params["theta"],
            "sigma_avg": params["sigma"],
            "window_count": 1,
        }

    window_size = max(min_window_points, len(clean) // 3)
    step = max(1, window_size // 4)

    theta_values: list[float] = []
    sigma_values: list[float] = []

    for start in range(0, len(clean) - window_size + 1, step):
        window = clean.iloc[start : start + window_size]
        try:
            params = estimate_ou_params(window, dt_seconds)
        except Exception:
            continue
        if np.isfinite(params["theta"]) and params["theta"] > 0:
            theta_values.append(float(params["theta"]))
        if np.isfinite(params["sigma"]) and params["sigma"] > 0:
            sigma_values.append(float(params["sigma"]))

    if not theta_values or not sigma_values:
        params = estimate_ou_params(clean, dt_seconds)
        theta_values = [float(params["theta"])]
        sigma_values = [float(params["sigma"])]

    return {
        "theta_avg": round(float(np.median(theta_values)), 6),
        "sigma_avg": round(float(np.median(sigma_values)), 6),
        "window_count": min(len(theta_values), len(sigma_values)),
    }
