"""Render a presentation-quality stress chart for the pitch deck.

Produces a high-contrast, large-font version of the stress replay chart
optimized for slide readability at standard presentation distances.
"""

from __future__ import annotations

import os
from pathlib import Path

MPL_CACHE_DIR = Path(__file__).resolve().parent / ".mplcache"
MPL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(MPL_CACHE_DIR))

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import pandas as pd

CSV_PATH = Path(__file__).resolve().parent / "charts" / "stress_scenario.csv"
OUTPUT_PATH = Path(__file__).resolve().parent / "charts" / "stress_scenario_deck.png"


def plot_deck_chart(
    csv_path: Path = CSV_PATH,
    output_path: Path = OUTPUT_PATH,
) -> Path:
    df = pd.read_csv(csv_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)

    # --- Style ---
    BG = "#07101d"
    PANEL = "#101e33"
    TEXT = "#f5f8ff"
    MUTED = "#a0aec0"
    RED = "#fb7185"
    GREEN = "#34d399"
    AMBER = "#f59e0b"
    GRID = "rgba(88,166,255,0.12)"

    plt.rcParams.update({
        "figure.facecolor": BG,
        "axes.facecolor": PANEL,
        "axes.edgecolor": MUTED,
        "axes.labelcolor": TEXT,
        "axes.titlesize": 18,
        "axes.labelsize": 16,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "xtick.labelsize": 14,
        "ytick.labelsize": 14,
        "text.color": TEXT,
        "legend.fontsize": 14,
        "legend.facecolor": PANEL,
        "legend.edgecolor": MUTED,
        "grid.color": "#1a2d4a",
        "grid.alpha": 0.5,
        "font.family": "sans-serif",
    })

    fig, (ax1, ax2, ax3) = plt.subplots(
        3, 1, figsize=(16, 10), sharex=True,
        gridspec_kw={"hspace": 0.12},
    )

    # --- Panel 1: Peg Deviation ---
    ax1.plot(df["timestamp"], df["spread_pct"], color=RED, linewidth=2.5)
    ax1.axhline(0.0, color=MUTED, linestyle="--", alpha=0.4, linewidth=1)
    ax1.set_ylabel("Peg deviation", fontweight="bold")
    ax1.set_title(
        "stETH/ETH June 2022 Depeg Replay — Fixed LTV vs Dynamic Oracle",
        fontsize=20, fontweight="bold", pad=16, color=TEXT,
    )
    ax1.grid(True, alpha=0.3)
    ax1.yaxis.set_major_formatter(mticker.PercentFormatter(xmax=1, decimals=1))

    # --- Panel 2: LTV Comparison ---
    ax2.plot(
        df["timestamp"], df["ltv_no_oracle"],
        label="Static LTV (0.80)", color=RED,
        linewidth=2.5, linestyle="--",
    )
    ax2.plot(
        df["timestamp"], df["ltv_with_oracle"],
        label="PegShield dynamic LTV", color=GREEN,
        linewidth=3,
    )
    ax2.axhline(0.40, color=AMBER, linestyle=":", alpha=0.6, linewidth=1.5, label="Emergency floor")
    ax2.set_ylabel("LTV", fontweight="bold")
    ax2.legend(loc="center left", fontsize=13, framealpha=0.8)
    ax2.grid(True, alpha=0.3)

    # --- Panel 3: Shortfall ---
    ax3.fill_between(
        df["timestamp"], df["shortfall_static"],
        alpha=0.5, color=RED, label="Shortfall: static LTV",
    )
    ax3.fill_between(
        df["timestamp"], df["shortfall_dynamic"],
        alpha=0.5, color=GREEN, label="Shortfall: PegShield",
    )
    ax3.set_ylabel("Shortfall (USD)", fontweight="bold")
    ax3.legend(loc="upper left", fontsize=13, framealpha=0.8)
    ax3.grid(True, alpha=0.3)
    ax3.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, p: f"${x:,.0f}"))

    # Date formatting
    timestamps = df["timestamp"]
    span = timestamps.iloc[-1] - timestamps.iloc[0]
    if span.total_seconds() > 172800:
        ax3.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    else:
        ax3.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))

    fig.autofmt_xdate(rotation=0, ha="center")
    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print(f"Wrote deck chart to {output_path}")
    return output_path


if __name__ == "__main__":
    plot_deck_chart()
