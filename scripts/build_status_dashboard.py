#!/usr/bin/env python3
"""Build a static PegShield status dashboard from committed oracle artifacts."""

from __future__ import annotations

import argparse
import html
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS_DIR = ROOT / "artifacts"
DEFAULT_OUTPUT = ARTIFACTS_DIR / "status_dashboard.html"


def load_snapshots(artifacts_dir: Path) -> list[dict[str, Any]]:
    snapshots: list[dict[str, Any]] = []
    for path in sorted(artifacts_dir.glob("oracle_state.*.json")):
        if path.name == "oracle_state.json":
            continue
        snapshots.append(json.loads(path.read_text(encoding="utf-8")))
    if not snapshots and (artifacts_dir / "oracle_state.json").exists():
        snapshots.append(json.loads((artifacts_dir / "oracle_state.json").read_text(encoding="utf-8")))
    return snapshots


def pct(value: Any, digits: int = 2) -> str:
    if value is None:
        return "n/a"
    return f"{float(value) * 100:.{digits}f}%"


def num(value: Any, digits: int = 4) -> str:
    if value is None:
        return "n/a"
    return f"{float(value):.{digits}f}"


def iso_from_timestamp(value: Any) -> str:
    if not value:
        return "n/a"
    return datetime.fromtimestamp(int(value), tz=UTC).isoformat()


def status_class(snapshot: dict[str, Any]) -> str:
    if int(snapshot.get("regime_flag", 0)) == 1:
        return "critical"
    liquidity_status = str(snapshot.get("liquidity_risk", {}).get("status", "UNKNOWN")).upper()
    if liquidity_status in {"SEVERE", "STRESSED"}:
        return "warn"
    if snapshot.get("analytics_status") != "trusted":
        return "warn"
    return "ok"


def why_ltv_moved(snapshot: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    statistical_ltv = float(snapshot.get("statistical_ltv", snapshot.get("suggested_ltv", 0.0)))
    suggested_ltv = float(snapshot.get("suggested_ltv", 0.0))
    liquidity = snapshot.get("liquidity_risk", {}) or {}
    liquidity_haircut = float(liquidity.get("haircut", 0.0) or 0.0)

    if int(snapshot.get("regime_flag", 0)) == 1:
        reasons.append("Critical regime: model detected non-stationary stress and forced conservative LTV.")
    if liquidity_haircut > 0:
        reasons.append(f"Liquidity haircut reduced LTV by {pct(liquidity_haircut)}.")
    if suggested_ltv < statistical_ltv and liquidity_haircut <= 0:
        reasons.append("Suggested LTV is below statistical LTV due to model clamps or fallback policy.")
    if suggested_ltv >= 0.8 and int(snapshot.get("regime_flag", 0)) == 0 and liquidity_haircut == 0:
        reasons.append("No active stress: statistical model is at the protocol cap and no liquidity haircut is active.")
    if snapshot.get("analytics_status") != "trusted":
        reasons.append("Historical analytics withheld because bridge history came from fallback cache.")
    if not reasons:
        reasons.append("LTV follows the current OU volatility and mean-reversion signal.")
    return reasons


def render_snapshot(snapshot: dict[str, Any]) -> str:
    liquidity = snapshot.get("liquidity_risk", {}) or {}
    cls = status_class(snapshot)
    reasons = "".join(f"<li>{html.escape(reason)}</li>" for reason in why_ltv_moved(snapshot))
    components = liquidity.get("components", {}) or {}
    component_items = "".join(
        f"<span>{html.escape(str(name)).replace('_', ' ')}: {pct(value, 1)}</span>"
        for name, value in components.items()
    ) or "<span>no liquidity metrics supplied</span>"

    return f"""
    <article class="asset {cls}">
      <header>
        <div>
          <p class="eyebrow">{html.escape(snapshot.get("asset_display_name") or snapshot.get("asset_symbol") or snapshot["lst_id"])}</p>
          <h2>{html.escape(snapshot["lst_id"])}</h2>
        </div>
        <strong>{html.escape(str(snapshot.get("status", "UNKNOWN")))}</strong>
      </header>
      <div class="metrics">
        <section><span>Suggested LTV</span><b>{pct(snapshot.get("suggested_ltv"))}</b></section>
        <section><span>Statistical LTV</span><b>{pct(snapshot.get("statistical_ltv", snapshot.get("suggested_ltv")))}</b></section>
        <section><span>Peg Deviation</span><b>{pct(snapshot.get("peg_deviation_pct"), 3)}</b></section>
        <section><span>Z-score</span><b>{num(snapshot.get("z_score"), 3)}</b></section>
        <section><span>Liquidity Risk</span><b>{html.escape(str(liquidity.get("status", "UNKNOWN")))}</b></section>
        <section><span>Liquidity Haircut</span><b>{pct(liquidity.get("haircut", 0.0))}</b></section>
      </div>
      <div class="details">
        <p><b>Reference rate:</b> {num(snapshot.get("reference_rate"), 6)} via {html.escape(str(snapshot.get("reference_rate_source", "unknown")))}</p>
        <p><b>Oracle updated:</b> {html.escape(iso_from_timestamp(snapshot.get("timestamp")))} | <b>History:</b> {html.escape(str(snapshot.get("history_source", "unknown")))}</p>
      </div>
      <div class="components">{component_items}</div>
      <h3>Why LTV Moved</h3>
      <ul>{reasons}</ul>
    </article>
    """


def render_dashboard(snapshots: list[dict[str, Any]]) -> str:
    generated_at = datetime.now(tz=UTC).isoformat()
    assets = "\n".join(render_snapshot(snapshot) for snapshot in snapshots)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PegShield Status Dashboard</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #17201b;
      --muted: #637067;
      --line: #d7ded8;
      --paper: #f8faf7;
      --panel: #ffffff;
      --ok: #2f7d4f;
      --warn: #9a6500;
      --critical: #b42318;
      --accent: #245d63;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--paper);
      color: var(--ink);
      letter-spacing: 0;
    }}
    main {{
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 28px 0 40px;
    }}
    .topbar {{
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 18px;
      margin-bottom: 18px;
    }}
    h1, h2, h3, p {{ margin: 0; }}
    h1 {{ font-size: 26px; font-weight: 720; }}
    .generated {{ color: var(--muted); font-size: 13px; }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 14px;
    }}
    .asset {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-left: 5px solid var(--ok);
      border-radius: 8px;
      padding: 16px;
    }}
    .asset.warn {{ border-left-color: var(--warn); }}
    .asset.critical {{ border-left-color: var(--critical); }}
    .asset header {{
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }}
    .eyebrow {{
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 700;
    }}
    h2 {{ font-size: 22px; }}
    header strong {{
      font-size: 12px;
      color: var(--accent);
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 8px;
      white-space: nowrap;
    }}
    .metrics {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }}
    .metrics section {{
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      min-height: 66px;
    }}
    .metrics span, .details {{ color: var(--muted); font-size: 12px; }}
    .metrics b {{
      display: block;
      font-size: 22px;
      margin-top: 4px;
    }}
    .details {{
      display: grid;
      gap: 5px;
      border-top: 1px solid var(--line);
      padding-top: 10px;
      margin-top: 4px;
    }}
    .components {{
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 12px 0;
    }}
    .components span {{
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 8px;
      color: var(--muted);
      font-size: 12px;
    }}
    h3 {{ font-size: 14px; margin-top: 6px; }}
    ul {{
      margin: 8px 0 0;
      padding-left: 18px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }}
    @media (max-width: 640px) {{
      main {{ width: min(100% - 20px, 1180px); padding-top: 18px; }}
      .topbar {{ align-items: start; flex-direction: column; }}
      .grid {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <main>
    <section class="topbar">
      <div>
        <h1>PegShield Status Dashboard</h1>
        <p class="generated">Current LST collateral risk signal from committed oracle artifacts.</p>
      </div>
      <p class="generated">Generated {html.escape(generated_at)}</p>
    </section>
    <section class="grid">
      {assets}
    </section>
  </main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the static PegShield status dashboard.")
    parser.add_argument("--artifacts-dir", default=str(ARTIFACTS_DIR))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()

    artifacts_dir = Path(args.artifacts_dir)
    snapshots = load_snapshots(artifacts_dir)
    if not snapshots:
        raise SystemExit(f"No oracle snapshots found in {artifacts_dir}")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_dashboard(snapshots), encoding="utf-8")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
