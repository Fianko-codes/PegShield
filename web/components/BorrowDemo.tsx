"use client";

import { useMemo, useState } from "react";
import type { OracleSnapshot, Scenario } from "@/lib/types";
import { usd, usdCompact, pct, pp, signedPct } from "@/lib/format";
import { fmtDate } from "@/lib/format";
import { IconCheck, IconBlock, IconArrow } from "./Brand";
import { SectionHead } from "./ui";
import styles from "./BorrowDemo.module.css";

type Market = "normal" | "stress";

const STATIC_LTV = 0.8;
const C_MIN = 25_000;
const C_MAX = 1_000_000;
const C_DEFAULT = 250_000;

export function BorrowDemo({
  snapshot,
  scenario,
}: {
  snapshot: OracleSnapshot;
  scenario: Scenario;
}) {
  const [market, setMarket] = useState<Market>("stress");
  const [collateral, setCollateral] = useState(C_DEFAULT);

  // Derive the stress model straight from the committed historical replay.
  const stress = useMemo(() => {
    const pts = scenario.points;
    const worstSpread = Math.min(...pts.map((p) => p.peg_deviation));
    const minZ = Math.min(...pts.map((p) => p.z_score));
    const oracleLtv = Math.min(...pts.map((p) => p.ltv_with_oracle));
    return {
      oracleLtv,
      worstSpread,
      minZ,
      peakStaticShortfall: scenario.summary.peakShortfallStatic,
      peakDynamicShortfall: scenario.summary.peakShortfallDynamic,
      maxLossPrevented: scenario.summary.maxLossPrevented,
    };
  }, [scenario]);

  const isStress = market === "stress";
  const requested = collateral * STATIC_LTV;

  // The oracle publishes a 40% floor in the historical CRITICAL interval.
  // The reference Gate is stricter here: halt_on_critical=true applies 0%.
  const oracleLtv = isStress ? stress.oracleLtv : snapshot.suggestedLtv;
  const appliedLtv = isStress ? 0 : oracleLtv;
  const pegLent = collateral * appliedLtv;
  const fallbackMaxBorrow = collateral * stress.oracleLtv;
  const staticLent = requested;
  const removed = staticLent - pegLent;

  const fillPct = ((collateral - C_MIN) / (C_MAX - C_MIN)) * 100;

  // Diagnostics per market
  const diag = isStress
    ? {
        peg: signedPct(stress.worstSpread, 1),
        z: stress.minZ.toFixed(2),
        regime: "CRITICAL",
        regimeTone: "var(--coral)",
        oracleLtv: pct(stress.oracleLtv, 0),
        appliedLtv: pct(appliedLtv, 0),
      }
    : {
        peg: signedPct(snapshot.pegDeviationPct, 2),
        z: snapshot.zScore.toFixed(2),
        regime: "NORMAL",
        regimeTone: "var(--emerald)",
        oracleLtv: pct(snapshot.suggestedLtv, 2),
        appliedLtv: pct(appliedLtv, 2),
      };

  return (
    <section className="section" id="demo">
      <div className="container">
        <SectionHead
          kicker="The moment that matters"
          title={
            <>
              The same borrow. Two policies.{" "}
              <span className="text-2">One says yes.</span>
            </>
          }
          lede="A borrower posts LST collateral and asks to borrow the maximum a static 80% table allows. Flip the market condition and watch the decision diverge — a static policy keeps lending; PegShield removes the credit before the shortfall arrives."
        />

        <div className={styles.shell}>
          {/* Controls */}
          <div className={styles.controls}>
            <div
              className={styles.segment}
              role="tablist"
              aria-label="Market condition"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!isStress}
                className={`${styles.segBtn} ${!isStress ? styles.activeNormal : ""}`}
                onClick={() => setMarket("normal")}
              >
                <span
                  className={styles.segDot}
                  style={{ background: "var(--emerald)" }}
                />
                Normal market
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isStress}
                className={`${styles.segBtn} ${isStress ? styles.activeStress : ""}`}
                onClick={() => setMarket("stress")}
              >
                <span
                  className={styles.segDot}
                  style={{ background: "var(--coral)" }}
                />
                LST under stress
              </button>
            </div>

            <div
              className={styles.slider}
              style={{ ["--fill" as string]: `${fillPct}%` }}
            >
              <div className={styles.sliderTop}>
                <span className={styles.sliderLabel}>Collateral posted</span>
                <span className={styles.sliderValue}>{usd(collateral)}</span>
              </div>
              <input
                type="range"
                className={styles.range}
                min={C_MIN}
                max={C_MAX}
                step={5_000}
                value={collateral}
                onChange={(e) => setCollateral(Number(e.target.value))}
                aria-label="Collateral posted, in US dollars"
              />
            </div>
          </div>

          {/* Panels */}
          <div className={styles.panels}>
            {/* Static */}
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <span className={styles.panelTitle}>
                  Static 80% LTV table
                </span>
                <span className={styles.verdict + " " + styles.verdictAllow}>
                  <IconCheck /> ALLOW
                </span>
              </div>
              <div className={styles.amount}>
                <span className={styles.amountLabel}>New borrow authorized</span>
                <span className={styles.amountValue}>{usd(staticLent)}</span>
              </div>
              <LtvBar fraction={STATIC_LTV} tone="neutral" label={pct(STATIC_LTV, 0)} />
              <p className={styles.panelFoot}>
                A governance-set collateral factor. It doesn’t see the peg moving,
                so it authorizes the full loan in both markets until the policy is
                explicitly updated.
              </p>
            </div>

            {/* PegShield */}
            <div
              className={styles.panel}
              style={{
                background: isStress
                  ? "linear-gradient(180deg, rgba(242,100,93,0.05), var(--surface))"
                  : "linear-gradient(180deg, rgba(62,207,142,0.045), var(--surface))",
              }}
            >
              <div className={styles.panelHead}>
                <span className={styles.panelTitle}>PegShield Gate</span>
                {isStress ? (
                  <span className={styles.verdict + " " + styles.verdictReject}>
                    <IconBlock /> REJECT
                  </span>
                ) : (
                  <span className={styles.verdict + " " + styles.verdictReduced}>
                    <IconCheck /> ALLOW · reduced
                  </span>
                )}
              </div>
              <div className={styles.amount}>
                <span className={styles.amountLabel}>
                  {isStress ? "New borrow (halt policy applied)" : "New borrow authorized"}
                </span>
                <span
                  className={styles.amountValue}
                  style={{ color: isStress ? "var(--coral-bright)" : "var(--emerald)" }}
                >
                  {usd(pegLent)}
                </span>
                {isStress ? (
                  <span className={styles.amountContext}>
                    {usd(requested)} requested · oracle fallback permits up to{" "}
                    {usd(fallbackMaxBorrow)}
                  </span>
                ) : null}
              </div>
              {isStress ? (
                <LtvBar
                  fraction={0}
                  tone="reject"
                  overlay={`GATE 0% · ORACLE ${pct(stress.oracleLtv, 0)}`}
                />
              ) : (
                <LtvBar
                  fraction={snapshot.suggestedLtv}
                  tone="emerald"
                  label={pct(snapshot.suggestedLtv, 2)}
                  tick={{ at: STATIC_LTV, label: "static 80%" }}
                />
              )}
              <p className={styles.panelFoot}>
                {isStress ? (
                  <>
                    Regime is <b style={{ color: "var(--coral)" }}>CRITICAL</b>. With{" "}
                    <span className="mono">halt_on_critical = true</span> the gate
                    applies 0% and rejects new borrows. With that policy disabled,
                    the oracle’s {pct(stress.oracleLtv, 0)} floor permits at most{" "}
                    {usd(fallbackMaxBorrow)} — still below this {usd(requested)} request.
                  </>
                ) : (
                  <>
                    Statistical LTV is <span className="mono">{pct(snapshot.statisticalLtv, 2)}</span>,
                    trimmed by a <span className="mono">−{pp(snapshot.dataQualityRisk.haircut, 2)}</span>{" "}
                    data-quality haircut{snapshot.liquidityRisk.haircut > 0 ? (
                      <> and <span className="mono">−{pp(snapshot.liquidityRisk.haircut, 2)}</span> liquidity haircut</>
                    ) : null} to{" "}
                    <b style={{ color: "var(--emerald)" }}>{pct(snapshot.suggestedLtv, 2)}</b>. PegShield
                    already lends more conservatively than the static table, before
                    any stress appears.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Outcome banner */}
          <div className={styles.outcome}>
            <div className={styles.outcomeMain}>
              <span className={styles.outcomeLabel}>
                {isStress ? "New credit removed" : "Exposure trimmed vs static"}
              </span>
              <span
                className={styles.outcomeValue}
                style={{ color: isStress ? "var(--coral-bright)" : "var(--emerald)" }}
              >
                {usd(removed)}
              </span>
              <span className={styles.outcomeSub}>
                {isStress
                  ? "new credit the static policy would have extended in the historical depeg replay — blocked by the reference Gate policy."
                  : "smaller loan, same collateral — a standing conservative margin PegShield holds even in calm markets."}
              </span>
            </div>

            {isStress && (
              <div className={styles.histStat}>
                <div className={styles.histItem}>
                  <span className={styles.histValue} style={{ color: "var(--coral-bright)" }}>
                    {usdCompact(stress.peakStaticShortfall)}
                  </span>
                  <span className={styles.histLabel}>peak static shortfall</span>
                </div>
                <div className={styles.histItem}>
                  <span className={styles.histValue} style={{ color: "var(--emerald)" }}>
                    {usd(stress.peakDynamicShortfall)}
                  </span>
                  <span className={styles.histLabel}>PegShield shortfall</span>
                </div>
              </div>
            )}
          </div>

          {/* Diagnostics */}
          <div className={styles.diag}>
            <DiagCell label="Peg deviation" value={diag.peg} />
            <DiagCell label="Z-score" value={diag.z} />
            <DiagCell
              label="Regime"
              value={diag.regime}
              tone={diag.regimeTone}
            />
            <DiagCell label="Oracle LTV" value={diag.oracleLtv} />
            <DiagCell
              label="Gate-applied LTV"
              value={diag.appliedLtv}
              tone={isStress ? "var(--coral-bright)" : "var(--emerald)"}
            />
          </div>

          {/* Source */}
          <div className={styles.sourceBar}>
            {isStress ? (
              <span>
                Source · committed historical replay — stETH/ETH June 2022 depeg ·{" "}
                <span style={{ color: "var(--text-3)" }}>artifacts/stress_scenario.json</span>
              </span>
            ) : (
              <span>
                Source · offline verified snapshot — {snapshot.lstId} ·{" "}
                <span style={{ color: "var(--text-3)" }}>
                  artifacts/oracle_state.mSOL-v2.json · modeled {fmtDate(snapshot.updatedAtIso)}
                </span>
              </span>
            )}
            <a href="#evidence" style={{ marginLeft: "auto" }}>
              See the full stress evidence <IconArrow style={{ verticalAlign: "-2px" }} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function LtvBar({
  fraction,
  tone,
  label,
  overlay,
  tick,
}: {
  fraction: number;
  tone: "emerald" | "neutral" | "reject";
  label?: string;
  overlay?: string;
  tick?: { at: number; label: string };
}) {
  const bg =
    tone === "emerald"
      ? "var(--emerald)"
      : tone === "neutral"
        ? "var(--surface-hi)"
        : "transparent";
  return (
    <div className={styles.ltvBar}>
      {overlay ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background:
              "repeating-linear-gradient(45deg, rgba(242,100,93,0.10) 0 8px, transparent 8px 16px)",
            color: "var(--coral-bright)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {overlay}
        </div>
      ) : (
        <div
          className={styles.ltvFill}
          style={{
            width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
            background: bg,
          }}
        >
          {label && fraction > 0.12 ? (
            <span
              className={styles.ltvFillLabel}
              style={tone === "neutral" ? { color: "var(--text)" } : undefined}
            >
              {label}
            </span>
          ) : null}
        </div>
      )}
      {tick ? (
        <div className={styles.ltvTick} style={{ left: `${tick.at * 100}%` }}>
          <span className={styles.ltvTickLabel} style={{ left: 0 }}>
            {tick.label}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function DiagCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={styles.diagCell}>
      <span className={styles.diagLabel}>{label}</span>
      <span className={styles.diagValue} style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </div>
  );
}
