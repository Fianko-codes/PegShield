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


def figure_architecture() -> None:
    fig, ax = plt.subplots(figsize=(9.5, 3.4))
    ax.set_axis_off()

    boxes = [
        ("Pyth Hermes\nLST/SOL prices", 0.04, 0.55, BLUE),
        ("Reference rates\nMarinade/Jito/SolBlaze", 0.04, 0.17, TEAL),
        ("Bridge\npeg deviation", 0.25, 0.36, INK),
        ("Core engine\nOU + ADF + haircuts", 0.45, 0.36, INK),
        ("Updater / attesters\nfixed-point payload", 0.66, 0.36, INK),
        ("RiskState PDA\nsuggested LTV + regime", 0.86, 0.36, RED),
    ]

    for label, x, y, color in boxes:
        patch = FancyBboxPatch(
            (x, y),
            0.14,
            0.22,
            boxstyle="round,pad=0.012,rounding_size=0.02",
            linewidth=1.2,
            edgecolor=color,
            facecolor="#F9FAFB",
        )
        ax.add_patch(patch)
        ax.text(x + 0.07, y + 0.11, label, ha="center", va="center", fontsize=8.5, color=INK)

    arrows = [
        ((0.18, 0.66), (0.25, 0.47)),
        ((0.18, 0.28), (0.25, 0.47)),
        ((0.39, 0.47), (0.45, 0.47)),
        ((0.59, 0.47), (0.66, 0.47)),
        ((0.80, 0.47), (0.86, 0.47)),
    ]
    for start, end in arrows:
        ax.add_patch(FancyArrowPatch(start, end, arrowstyle="-|>", mutation_scale=12, color=MUTED, linewidth=1.2))

    ax.text(0.93, 0.22, "Lending protocols\nread + clamp", ha="center", va="center", fontsize=8.5, color=INK)
    ax.add_patch(FancyArrowPatch((0.93, 0.36), (0.93, 0.27), arrowstyle="-|>", mutation_scale=12, color=MUTED))
    ax.set_xlim(0, 1.04)
    ax.set_ylim(0.05, 0.85)
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
    fig, ax = plt.subplots(figsize=(8.6, 2.9))
    ax.set_axis_off()
    steps = [
        ("Registry\nthreshold + bond", BLUE),
        ("Register\nbonded attesters", TEAL),
        ("Propose\nround payload", AMBER),
        ("Confirm\nunique signer bitmap", AMBER),
        ("Finalize\nRiskState PDA", RED),
        ("Dispute\nslashable evidence", INK),
    ]
    xs = [0.05, 0.22, 0.39, 0.56, 0.73, 0.90]
    for (label, color), x in zip(steps, xs, strict=True):
        patch = FancyBboxPatch(
            (x - 0.065, 0.38),
            0.13,
            0.25,
            boxstyle="round,pad=0.012,rounding_size=0.025",
            linewidth=1.2,
            edgecolor=color,
            facecolor="#F9FAFB",
        )
        ax.add_patch(patch)
        ax.text(x, 0.505, label, ha="center", va="center", fontsize=8.2, color=INK)
    for left, right in zip(xs[:-1], xs[1:], strict=True):
        ax.add_patch(FancyArrowPatch((left + 0.07, 0.505), (right - 0.075, 0.505), arrowstyle="-|>", mutation_scale=12, color=MUTED))
    ax.text(0.5, 0.18, "Consumers continue to read the same RiskState PDA; only the write trust model changes.", ha="center", fontsize=8.6, color=MUTED)
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(0.05, 0.78)
    save(fig, "attester_cycle")


def main() -> None:
    figure_architecture()
    figure_steth_ltv()
    figure_shortfall()
    figure_attester_cycle()


if __name__ == "__main__":
    main()
