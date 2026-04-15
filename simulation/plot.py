"""Render the replay comparison chart."""

from __future__ import annotations

import os
from pathlib import Path

MPL_CACHE_DIR = Path(__file__).resolve().parent / ".mplcache"
MPL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(MPL_CACHE_DIR))

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd


def plot_stress_scenario(
    df: pd.DataFrame,
    output_path: Path,
    title: str | None = None,
    subtitle: str | None = None,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(13, 9), sharex=True)
    fig.suptitle(
        title or "Historical LST Depeg Replay — Fixed LTV vs Dynamic Oracle LTV",
        fontsize=14,
        fontweight="bold",
    )

    ax1.plot(df["timestamp"], df["spread_pct"], color="#d1495b", linewidth=1.8)
    ax1.axhline(0.0, color="#9a9a9a", linestyle="--", alpha=0.6)
    ax1.set_ylabel("Peg deviation")
    ax1.set_title(subtitle or "Replay path")

    ax2.plot(
        df["timestamp"],
        df["ltv_no_oracle"],
        label="Fixed LTV (0.80)",
        color="#d1495b",
        linewidth=1.5,
        linestyle="--",
    )
    ax2.plot(
        df["timestamp"],
        df["ltv_with_oracle"],
        label="Dynamic oracle LTV",
        color="#2d6a4f",
        linewidth=2.0,
    )
    ax2.axhline(0.40, color="#808080", linestyle=":", alpha=0.5, label="Emergency floor")
    ax2.set_ylabel("LTV")
    ax2.legend(loc="lower left", fontsize=9)

    ax3.fill_between(
        df["timestamp"],
        df["shortfall_static"],
        alpha=0.30,
        color="#d1495b",
        label="Shortfall risk: fixed LTV",
    )
    ax3.fill_between(
        df["timestamp"],
        df["shortfall_dynamic"],
        alpha=0.30,
        color="#2d6a4f",
        label="Shortfall risk: oracle LTV",
    )
    ax3.set_ylabel("Shortfall (USD)")
    ax3.legend(loc="upper left", fontsize=9)
    timestamps = pd.to_datetime(df["timestamp"], utc=True)
    span = timestamps.iloc[-1] - timestamps.iloc[0]
    if span.total_seconds() > 172800:
        ax3.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    else:
        ax3.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))

    plt.tight_layout()
    plt.savefig(output_path, dpi=160, bbox_inches="tight")
    plt.close(fig)
    return output_path
