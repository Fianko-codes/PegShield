"""Ornstein-Uhlenbeck parameter estimation helpers."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy import stats


def compute_spread(df: pd.DataFrame) -> pd.Series:
    return (df["msol_usd_price"] - df["sol_usd_price"]) / df["sol_usd_price"]


def estimate_ou_params(spread: pd.Series, dt_seconds: int) -> dict[str, Any]:
    clean = spread.dropna().astype(float)
    if len(clean) < 10:
        raise ValueError("Need at least 10 spread observations for OU estimation")

    dt = dt_seconds / 86400.0
    x = clean.to_numpy()
    dx = np.diff(x)
    x_lag = x[:-1]

    slope, intercept, _, _, _ = stats.linregress(x_lag, dx)
    residuals = dx - (intercept + slope * x_lag)

    theta_raw = -slope / dt if dt > 0 else 0.0
    theta = max(float(theta_raw), 1e-6)

    if abs(slope) < 1e-9:
        mu = float(clean.mean())
    else:
        mu = float(intercept / (-slope))

    sigma = max(float(np.std(residuals, ddof=1) / np.sqrt(dt)), 1e-6)

    return {
        "theta": round(theta, 6),
        "mu": round(mu, 6),
        "sigma": round(sigma, 6),
    }
