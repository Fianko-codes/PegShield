#!/usr/bin/env python3
"""Generate publication figures for the PegShield R&D report."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

ROOT = Path(__file__).resolve().parents[1]
PAPER_DIR = Path(__file__).resolve().parent
FIG_DIR = PAPER_DIR / "figures"
STRESS_PATH = ROOT / "artifacts" / "stress_scenario.json"

INK = "#111827"
MUTED = "#6B7280"
BLUE = "#2563EB"
TEAL = "#0F766E"
RED = "#B91C1C"
AMBER = "#B45309"
GREEN = "#15803D"
GRID = "#E5E7EB"


def load_steth_points() -> list[dict]:
    bundle = json.loads(STRESS_PATH.read_text(encoding="utf-8"))
    for scenario in bundle["scenarios"]:
        if scenario["id"] == "steth_june_2022":
            return scenario["points"]
    raise RuntimeError("steth_june_2022 scenario not found")


def save(fig: plt.Figure, name: str) -> None:
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIG_DIR / f"{name}.pdf", bbox_inches="tight")
    fig.savefig(FIG_DIR / f"{name}.png", bbox_inches="tight", dpi=220)
    plt.close(fig)


def style_axes(ax: plt.Axes) -> None:
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#9CA3AF")
    ax.spines["bottom"].set_color("#9CA3AF")
    ax.tick_params(colors=INK, labelsize=8)
    ax.grid(True, axis="y", color=GRID, linewidth=0.8)


def _flow_box(ax, cx, cy, w, h, title, subtitle, color):
    """Draw a rounded box centred at (cx, cy) with a bold title and muted subtitle.

    Coordinates are in data units; the axes use aspect='equal' so a data unit is
    the same length on both axes and text/box geometry is predictable.
    """
    patch = FancyBboxPatch(
        (cx - w / 2, cy - h / 2),
        w,
        h,
        boxstyle="round,pad=0.04,rounding_size=0.10",
        linewidth=1.6,
        edgecolor=color,
        facecolor="#FFFFFF",
        mutation_aspect=1.0,
    )
    ax.add_patch(patch)
    if subtitle:
        ax.text(cx, cy + 0.20, title, ha="center", va="center",
                fontsize=9.5, fontweight="bold", color=color)
        ax.text(cx, cy - 0.30, subtitle, ha="center", va="center",
                fontsize=7.6, color=MUTED, linespacing=1.15)
    else:
        ax.text(cx, cy, title, ha="center", va="center",
                fontsize=9.5, fontweight="bold", color=color)


def _flow_arrow(ax, start, end, color=INK):
    ax.add_patch(FancyArrowPatch(
        start, end,
        arrowstyle="-|>", mutation_scale=18,
        linewidth=2.0, color=color,
        shrinkA=2, shrinkB=2,
    ))


def figure_architecture() -> None:
    # Data-unit canvas; figsize matches the xlim:ylim ratio so aspect='equal'
    # leaves no distortion and box geometry is exactly as specified.
    fig, ax = plt.subplots(figsize=(10.0, 4.2))
    ax.set_axis_off()
    ax.set_aspect("equal")
    ax.set_xlim(0, 20.0)
    ax.set_ylim(0, 8.4)

    W, H = 3.4, 1.9
    mid = 4.7  # middle-row y for the linear pipeline

    # Two input sources (left), stacked. Titles are single-line to avoid
    # colliding with the subtitle.
    _flow_box(ax, 2.1, 6.4, W, H, "Pyth Hermes", "LST and SOL\nmarket prices", BLUE)
    _flow_box(ax, 2.1, 2.6, W, H, "Reference rates", "Marinade · Jito\n· SolBlaze", TEAL)

    # Linear processing pipeline.
    pipeline = [
        (6.4, "Bridge", "peg\ndeviation", INK),
        (10.0, "Core engine", "OU · ADF\n· haircuts", INK),
        (13.6, "Updater", "attester path ·\nfixed-point", INK),
        (17.2, "RiskState PDA", "suggested LTV\n+ regime", RED),
    ]
    for cx, title, subtitle, color in pipeline:
        _flow_box(ax, cx, mid, W, H, title, subtitle, color)

    # Inputs merge into the bridge (distinct landing points, not the same spot).
    bridge_left = 6.4 - W / 2
    _flow_arrow(ax, (2.1 + W / 2, 6.4), (bridge_left, mid + 0.55))
    _flow_arrow(ax, (2.1 + W / 2, 2.6), (bridge_left, mid - 0.55))

    # Pipeline arrows.
    centers = [6.4, 10.0, 13.6, 17.2]
    for left, right in zip(centers[:-1], centers[1:], strict=True):
        _flow_arrow(ax, (left + W / 2, mid), (right - W / 2, mid))

    # Down to consumers.
    _flow_box(ax, 17.2, 1.5, W, H, "Lenders", "read · clamp\n· fall back", AMBER)
    _flow_arrow(ax, (17.2, mid - H / 2), (17.2, 1.5 + H / 2))

    save(fig, "system_architecture")




def figure_steth_ltv() -> None:
    points = load_steth_points()
    dates = [datetime.fromisoformat(point["timestamp"]) for point in points]
    peg = [100 * point["peg_deviation"] for point in points]
    dynamic_ltv = [100 * point["ltv_with_oracle"] for point in points]
    static_ltv = [100 * point["ltv_no_oracle"] for point in points]
    critical = [point["regime_flag"] == 1 for point in points]

    fig, ax1 = plt.subplots(figsize=(8.2, 3.8))
    ax2 = ax1.twinx()
    style_axes(ax1)
    ax2.spines["top"].set_visible(False)
    ax2.spines["right"].set_color("#9CA3AF")
    ax2.tick_params(colors=INK, labelsize=8)

    for date, is_critical in zip(dates, critical, strict=True):
        if is_critical:
            ax1.axvspan(date, date, color=RED, alpha=0.18, linewidth=5)

    ax1.plot(dates, dynamic_ltv, color=BLUE, linewidth=2.2, label="PegShield LTV")
    ax1.plot(dates, static_ltv, color=MUTED, linewidth=1.6, linestyle="--", label="Static LTV")
    ax2.plot(dates, peg, color=RED, linewidth=1.8, label="Peg deviation")

    ax1.set_ylabel("LTV (%)", fontsize=9, color=INK)
    ax2.set_ylabel("Peg deviation (%)", fontsize=9, color=INK)
    ax1.set_ylim(35, 84)
    ax2.set_ylim(min(peg) - 1.0, 0)
    ax1.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax1.set_title("stETH/ETH replay: dynamic collateral factor vs. peg deviation", fontsize=10, color=INK)
    lines = ax1.get_lines() + ax2.get_lines()
    ax1.legend(lines, [line.get_label() for line in lines], loc="lower left", fontsize=8, frameon=False)
    fig.autofmt_xdate(rotation=0)
    save(fig, "steth_ltv_peg")


def figure_shortfall() -> None:
    points = load_steth_points()
    dates = [datetime.fromisoformat(point["timestamp"]) for point in points]
    static = [point["shortfall_static"] for point in points]
    dynamic = [point["shortfall_dynamic"] for point in points]

    fig, ax = plt.subplots(figsize=(8.2, 3.4))
    style_axes(ax)
    ax.plot(dates, static, color=AMBER, linewidth=2.1, label="Static 80% shortfall")
    ax.plot(dates, dynamic, color=GREEN, linewidth=2.1, label="PegShield shortfall")
    ax.fill_between(dates, dynamic, static, where=[s >= d for s, d in zip(static, dynamic, strict=True)], color=AMBER, alpha=0.18)
    ax.set_title("Modeled shortfall reduction in the stETH/ETH stress replay", fontsize=10, color=INK)
    ax.set_ylabel("Shortfall (USD)", fontsize=9, color=INK)
    ax.yaxis.set_major_formatter(lambda value, _: f"${value/1000:.0f}k")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.legend(loc="upper left", fontsize=8, frameon=False)
    fig.autofmt_xdate(rotation=0)
    save(fig, "shortfall_reduction")


def figure_attester_cycle() -> None:
    # Full-width single row (rendered as a figure* in the paper). Equal aspect so
    # the six boxes and connecting arrows keep their proportions.
    fig, ax = plt.subplots(figsize=(9.6, 3.0))
    ax.set_axis_off()
    ax.set_aspect("equal")
    ax.set_xlim(0, 19.2)
    ax.set_ylim(0, 6.0)

    steps = [
        ("Registry", "threshold\n+ bond", BLUE),
        ("Register", "bonded\nattesters", TEAL),
        ("Propose", "round\npayload", AMBER),
        ("Confirm", "signer\nbitmap", AMBER),
        ("Finalize", "RiskState\nPDA", RED),
        ("Dispute", "slashable\nevidence", INK),
    ]
    W, H = 2.5, 2.0
    cy = 4.0
    centers = [1.65 + i * 3.18 for i in range(len(steps))]
    for (title, subtitle, color), cx in zip(steps, centers, strict=True):
        _flow_box(ax, cx, cy, W, H, title, subtitle, color)
    for left, right in zip(centers[:-1], centers[1:], strict=True):
        _flow_arrow(ax, (left + W / 2, cy), (right - W / 2, cy))

    ax.text(
        centers[0] - W / 2,
        1.35,
        "Consumers continue to read the same RiskState PDA; only the write trust model changes.",
        ha="left", va="center", fontsize=8.4, color=MUTED, style="italic",
    )
    save(fig, "attester_cycle")



def main() -> None:
    figure_architecture()
    figure_steth_ltv()
    figure_shortfall()
    figure_attester_cycle()


if __name__ == "__main__":
    main()
