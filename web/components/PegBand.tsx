"use client";

import { useMemo } from "react";
import styles from "./PegBand.module.css";

// Deterministic peg-deviation story: calm within band → depeg breach → partial
// recovery. Read left-to-right as time. Emerald = within tolerance, coral =
// breach. The floating LTV chips show the consequence: the circuit breaker
// tightens the permitted LTV the moment deviation leaves the band.

const W = 760;
const H = 380;
const X0 = 56;
const X1 = 548;
const Y_PEG = 118;
const BAND_TOP = 100;
const BAND_BOT = 150;

// y-values in plot space (calm ~118, breach dips down toward 262)
const SERIES = [118, 121, 115, 124, 119, 122, 130, 150, 192, 236, 260, 246, 216, 200, 194];
const BREACH_INDEX = 7; // first point at/below band bottom

function xAt(i: number, n: number) {
  return X0 + (i / (n - 1)) * (X1 - X0);
}

/** Smooth path through points using a light cardinal spline. */
function splinePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  const d: string[] = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
  const t = 0.18;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d.push(
      `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
    );
  }
  return d.join(" ");
}

export function PegBand() {
  const { fullPath, breachPath, pathLen, breachX } = useMemo(() => {
    const n = SERIES.length;
    const pts = SERIES.map((y, i) => ({ x: xAt(i, n), y }));
    const breachPts = pts.slice(BREACH_INDEX - 1);
    return {
      fullPath: splinePath(pts),
      breachPath: splinePath(breachPts),
      pathLen: 1400,
      breachX: xAt(BREACH_INDEX, n),
    };
  }, []);

  return (
    <div className={styles.wrap} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img">
        <defs>
          <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(62,207,142,0.12)" />
            <stop offset="100%" stopColor="rgba(62,207,142,0.02)" />
          </linearGradient>
          <linearGradient id="breachFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(242,100,93,0.22)" />
            <stop offset="100%" stopColor="rgba(242,100,93,0)" />
          </linearGradient>
          <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* tolerance band */}
        <rect x={X0} y={BAND_TOP} width={X1 - X0} height={BAND_BOT - BAND_TOP} fill="url(#bandFill)" />
        <line x1={X0} y1={BAND_TOP} x2={X1} y2={BAND_TOP} stroke="var(--emerald-line)" strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
        <line x1={X0} y1={BAND_BOT} x2={X1} y2={BAND_BOT} stroke="var(--emerald-line)" strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />

        {/* peg reference line */}
        <line x1={X0} y1={Y_PEG} x2={X1} y2={Y_PEG} stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="1 6" />
        <text x={X0} y={Y_PEG - 10} fill="var(--text-3)" fontSize="11" fontFamily="var(--font-mono)" letterSpacing="0.04em">
          peg · reference rate
        </text>
        <text x={X0} y={BAND_BOT + 16} fill="rgba(62,207,142,0.55)" fontSize="10.5" fontFamily="var(--font-mono)">
          tolerance band
        </text>

        {/* breach guide */}
        <g className={styles.breachGuide}>
          <line x1={breachX} y1={BAND_BOT} x2={breachX} y2={276} stroke="var(--coral-line)" strokeWidth="1" strokeDasharray="3 4" />
          <text x={breachX + 8} y={272} fill="var(--coral)" fontSize="11" fontFamily="var(--font-mono)">
            peg breach
          </text>
        </g>

        {/* breach area fill under coral segment */}
        <path
          className={styles.traceBreach}
          d={`${breachPath} L ${X1} ${H - 90} L ${xAt(BREACH_INDEX - 1, SERIES.length)} ${H - 90} Z`}
          fill="url(#breachFill)"
          stroke="none"
        />

        {/* main trace (emerald) draws on */}
        <path
          className={styles.trace}
          style={{ ["--len" as string]: pathLen }}
          d={fullPath}
          fill="none"
          stroke="var(--emerald)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* breach trace (coral) overlays the depeg portion */}
        <path
          className={styles.traceBreach}
          d={breachPath}
          fill="none"
          stroke="var(--coral)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#soft)"
        />

        {/* gliding indicator dot */}
        <circle
          className={styles.dot}
          r="4.5"
          fill="var(--emerald-bright)"
          style={{ offsetPath: `path('${fullPath}')` } as React.CSSProperties}
        />

        {/* LTV consequence chips */}
        <g className={styles.ltvChip} style={{ animationDelay: "2.0s" }}>
          <rect x={588} y={96} width={150} height={46} rx="10" fill="var(--surface-2)" stroke="var(--border-2)" />
          <text x={602} y={116} fill="var(--text-3)" fontSize="10.5" fontFamily="var(--font-mono)" letterSpacing="0.06em">STATIC POLICY</text>
          <text x={602} y={133} fill="var(--text-2)" fontSize="15" fontFamily="var(--font-mono)" fontWeight="500">LTV 80% · holds</text>
        </g>
        <g className={styles.ltvChip} style={{ animationDelay: "2.35s" }}>
          <rect x={588} y={206} width={150} height={46} rx="10" fill="var(--coral-dim)" stroke="var(--coral-line)" />
          <text x={602} y={226} fill="var(--coral)" fontSize="10.5" fontFamily="var(--font-mono)" letterSpacing="0.06em">PEGSHIELD</text>
          <text x={602} y={243} fill="#ffb4af" fontSize="15" fontFamily="var(--font-mono)" fontWeight="500">LTV → 40% · tighten</text>
        </g>
        {/* connector */}
        <g className={styles.ltvChip} style={{ animationDelay: "2.6s" }}>
          <line x1={663} y1={142} x2={663} y2={206} stroke="var(--coral-line)" strokeWidth="1.4" strokeDasharray="3 3" />
          <path d="M659 200 663 208 667 200" fill="var(--coral)" />
        </g>
      </svg>
    </div>
  );
}
