"use client";

import { useMemo, useRef, useState } from "react";
import type { ScenarioPoint } from "@/lib/types";
import { pct, signedPct } from "@/lib/format";

const VBW = 920;
const VBH = 430;
const ML = 52;
const MR = 16;
// panel 1 = peg spread; panel 2 = LTV response
const P1_TOP = 24;
const P1_BOT = 186;
const P2_TOP = 244;
const P2_BOT = 402;

const LTV_MIN = 0.3;
const LTV_MAX = 0.85;

function fmtShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function StressChart({ points }: { points: ScenarioPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const n = points.length;
    const plotW = VBW - ML - MR;
    const x = (i: number) => ML + (n <= 1 ? 0 : (i / (n - 1)) * plotW);

    // Use the true peg-deviation signal (negative during a depeg) for the top
    // panel. `spread_pct` is a different, non-peg metric in the synthetic paths.
    const spreads = points.map((p) => p.peg_deviation);
    const minS = Math.min(0, ...spreads);
    const maxS = Math.max(0, ...spreads);
    const padS = (maxS - minS) * 0.12 || 0.01;
    const sLo = minS - padS;
    const sHi = maxS + padS;
    const ySpread = (v: number) =>
      P1_BOT - ((v - sLo) / (sHi - sLo)) * (P1_BOT - P1_TOP);
    const yLtv = (v: number) =>
      P2_BOT - ((v - LTV_MIN) / (LTV_MAX - LTV_MIN)) * (P2_BOT - P2_TOP);

    const line = (fn: (p: ScenarioPoint) => number) =>
      points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${fn(p).toFixed(1)}`).join(" ");

    const spreadLine = line((p) => ySpread(p.peg_deviation));
    const spreadArea = `${spreadLine} L ${x(n - 1).toFixed(1)} ${ySpread(0).toFixed(1)} L ${x(0).toFixed(1)} ${ySpread(0).toFixed(1)} Z`;
    const staticLtvLine = line((p) => yLtv(p.ltv_no_oracle));
    const oracleLtvLine = line((p) => yLtv(p.ltv_with_oracle));

    // critical regime runs
    const bands: { x0: number; x1: number }[] = [];
    let start: number | null = null;
    points.forEach((p, i) => {
      if (p.regime_flag === 1 && start === null) start = i;
      if (p.regime_flag !== 1 && start !== null) {
        bands.push({ x0: x(start - 0.5), x1: x(i - 0.5) });
        start = null;
      }
    });
    if (start !== null) bands.push({ x0: x(start - 0.5), x1: x(n - 1) });

    return { n, x, ySpread, yLtv, spreadLine, spreadArea, staticLtvLine, oracleLtvLine, bands, sLo, sHi };
  }, [points]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VBW;
    const frac = (px - ML) / (VBW - ML - MR);
    const idx = Math.round(frac * (geo.n - 1));
    setHover(Math.max(0, Math.min(geo.n - 1, idx)));
  };

  const hp = hover !== null ? points[hover] : null;
  const hx = hover !== null ? geo.x(hover) : 0;
  const tipLeftPct = (hx / VBW) * 100;

  // y grid labels
  const ltvTicks = [0.4, 0.6, 0.8];

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VBW} ${VBH}`}
        style={{ width: "100%", height: "auto", display: "block", touchAction: "none" }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Peg deviation and LTV response over the scenario window"
      >
        <defs>
          <linearGradient id="spreadArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(242,100,93,0.02)" />
            <stop offset="100%" stopColor="rgba(242,100,93,0.22)" />
          </linearGradient>
        </defs>

        {/* critical bands */}
        {geo.bands.map((b, i) => (
          <rect
            key={i}
            x={b.x0}
            y={P1_TOP}
            width={Math.max(0, b.x1 - b.x0)}
            height={P2_BOT - P1_TOP}
            fill="rgba(242,100,93,0.07)"
          />
        ))}

        {/* panel labels */}
        <text x={ML} y={14} fill="var(--text-3)" fontSize="11" fontFamily="var(--font-mono)" letterSpacing="0.04em">
          PEG DEVIATION
        </text>
        <text x={ML} y={234} fill="var(--text-3)" fontSize="11" fontFamily="var(--font-mono)" letterSpacing="0.04em">
          PERMITTED LTV
        </text>

        {/* panel 1 baseline (0%) */}
        <line x1={ML} y1={geo.ySpread(0)} x2={VBW - MR} y2={geo.ySpread(0)} stroke="var(--border-2)" strokeWidth="1" />
        <text x={ML - 8} y={geo.ySpread(0) + 3} textAnchor="end" fill="var(--text-faint)" fontSize="10" fontFamily="var(--font-mono)">0%</text>
        <text x={ML - 8} y={geo.ySpread(geo.sLo) + 3} textAnchor="end" fill="var(--text-faint)" fontSize="10" fontFamily="var(--font-mono)">
          {pct(geo.sLo, 0)}
        </text>

        {/* spread area + line */}
        <path d={geo.spreadArea} fill="url(#spreadArea)" stroke="none" />
        <path d={geo.spreadLine} fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* panel 2 gridlines */}
        {ltvTicks.map((t) => (
          <g key={t}>
            <line x1={ML} y1={geo.yLtv(t)} x2={VBW - MR} y2={geo.yLtv(t)} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 5" />
            <text x={ML - 8} y={geo.yLtv(t) + 3} textAnchor="end" fill="var(--text-faint)" fontSize="10" fontFamily="var(--font-mono)">
              {pct(t, 0)}
            </text>
          </g>
        ))}

        {/* LTV lines */}
        <path d={geo.staticLtvLine} fill="none" stroke="var(--coral)" strokeWidth="2" strokeDasharray="6 5" strokeLinejoin="round" opacity="0.85" />
        <path d={geo.oracleLtvLine} fill="none" stroke="var(--emerald)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />

        {/* x axis dates */}
        {[0, Math.floor((geo.n - 1) / 2), geo.n - 1].map((i) => (
          <text
            key={i}
            x={geo.x(i)}
            y={P2_BOT + 20}
            textAnchor={i === 0 ? "start" : i === geo.n - 1 ? "end" : "middle"}
            fill="var(--text-faint)"
            fontSize="10.5"
            fontFamily="var(--font-mono)"
          >
            {fmtShort(points[i].timestamp)}
          </text>
        ))}

        {/* hover layer */}
        {hp && (
          <g pointerEvents="none">
            <line x1={hx} y1={P1_TOP} x2={hx} y2={P2_BOT} stroke="var(--border-strong)" strokeWidth="1" />
            <circle cx={hx} cy={geo.ySpread(hp.peg_deviation)} r="4" fill="var(--coral)" stroke="var(--ink)" strokeWidth="1.5" />
            <circle cx={hx} cy={geo.yLtv(hp.ltv_no_oracle)} r="4" fill="var(--coral)" stroke="var(--ink)" strokeWidth="1.5" />
            <circle cx={hx} cy={geo.yLtv(hp.ltv_with_oracle)} r="4.5" fill="var(--emerald)" stroke="var(--ink)" strokeWidth="1.5" />
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hp && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${tipLeftPct}%`,
            transform: `translateX(${tipLeftPct > 62 ? "-108%" : "8%"})`,
            pointerEvents: "none",
            background: "var(--surface-hi)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            padding: "10px 12px",
            minWidth: 168,
            boxShadow: "0 12px 34px -12px rgba(0,0,0,0.8)",
            fontSize: 12,
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)", marginBottom: 6 }}>
            {fmtShort(hp.timestamp)}
            {hp.regime_flag === 1 && (
              <span style={{ color: "var(--coral)", marginLeft: 8 }}>CRITICAL</span>
            )}
          </div>
          <TipRow label="Peg" value={signedPct(hp.peg_deviation, 2)} color="var(--coral)" />
          <TipRow label="Z-score" value={hp.z_score.toFixed(2)} color="var(--text)" />
          <TipRow label="Static LTV" value={pct(hp.ltv_no_oracle, 0)} color="var(--coral)" />
          <TipRow label="PegShield LTV" value={pct(hp.ltv_with_oracle, 0)} color="var(--emerald)" />
        </div>
      )}
    </div>
  );
}

function TipRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, lineHeight: 1.7 }}>
      <span style={{ color: "var(--text-3)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
