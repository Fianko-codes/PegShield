"""Regime classification using z-score and ADF stationarity."""

from __future__ import annotations

from typing import Any

import pandas as pd
from statsmodels.tsa.stattools import adfuller

ZSCORE_THRESHOLD = 2.5
ADF_PVALUE_THRESHOLD = 0.05


def detect_regime(spread: pd.Series) -> dict[str, Any]:
    clean = spread.dropna().astype(float)
    if len(clean) < 20:
        raise ValueError("Need at least 20 spread observations for regime detection")

    current = float(clean.iloc[-1])
    mean = float(clean.mean())
    std = float(clean.std(ddof=1))
    z_score = (current - mean) / std if std > 0 else 0.0

    adf_pvalue = float(adfuller(clean, autolag="AIC")[1])
    is_stationary = adf_pvalue < ADF_PVALUE_THRESHOLD
    extreme_deviation = abs(z_score) > ZSCORE_THRESHOLD
    regime_break = bool(extreme_deviation and not is_stationary)

    return {
        "z_score": round(z_score, 4),
        "adf_pvalue": round(adf_pvalue, 4),
        "is_stationary": is_stationary,
        "regime_flag": 1 if regime_break else 0,
        "status": "CRITICAL" if regime_break else "NORMAL",
    }
