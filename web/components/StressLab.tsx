"use client";

import { useState } from "react";
import type { Scenario } from "@/lib/types";
import { usd, usdCompact, pp, signedPct } from "@/lib/format";
import { SectionHead } from "./ui";
import { IconCheck, IconExternal } from "./Brand";
import { StressChart } from "./StressChart";
import styles from "./StressLab.module.css";

const KIND_LABEL: Record<string, string> = {
  historical: "real",
  synthetic: "synthetic",
  scenario_lab: "lab",
};

export function StressLab({ scenarios }: { scenarios: Scenario[] }) {
  const [activeId, setActiveId] = useState(scenarios[0]?.id);
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0];
  const s = active.summary;
  const lossPrevented = s.maxLossPrevented;
  // True deepest peg from the peg-deviation series (negative during a depeg).
  const deepestPeg = Math.min(...active.points.map((p) => p.peg_deviation));

  return (
    <section className="section" id="evidence">
      <div className="container">
        <SectionHead
          kicker="Stress evidence"
          title={
            <>
              Replayed against a real depeg — and eight ways markets break.
            </>
          }
          lede="One historical reconstruction (stETH/ETH, June 2022) plus a synthetic and scenario-lab suite. Each path is run through both a static 80% policy and PegShield’s dynamic LTV. The question isn’t whether every path loses money — it’s whether the breaker tightens in time and recovers cleanly."
        />

        <div className={styles.wrap}>
          <div className={styles.picker} role="tablist" aria-label="Stress scenario">
            {scenarios.map((sc) => (
              <button
                key={sc.id}
                role="tab"
                aria-selected={sc.id === active.id}
                className={`${styles.chip} ${sc.id === active.id ? styles.active : ""}`}
                onClick={() => setActiveId(sc.id)}
              >
                <span className={styles.chipKind}>{KIND_LABEL[sc.kind] ?? sc.kind}</span>
                {sc.title.replace(/^mSOL\/SOL /, "").replace(/^stETH\/ETH /, "")}
              </button>
            ))}
          </div>

          <div className={styles.board}>
            <div className={styles.chartCard}>
              <div className={styles.chartHead}>
                <div>
                  <div className={styles.chartTitle}>{active.title}</div>
                  <div className={styles.chartTag}>
                    {active.eventWindowLabel} · {s.rowCount} intervals · {s.criticalRows} in CRITICAL
                  </div>
                </div>
                <div className={styles.legend}>
                  <span className={styles.legItem}>
                    <span className={styles.legSwatch} style={{ background: "var(--coral)" }} /> Peg / static 80%
                  </span>
                  <span className={styles.legItem}>
                    <span className={styles.legSwatch} style={{ background: "var(--emerald)" }} /> PegShield LTV
                  </span>
                </div>
              </div>
              <StressChart points={active.points} />
            </div>

            <div className={styles.side}>
              <div className={styles.sideCard}>
                <p className={styles.sideTagline}>{active.tagline}</p>
                <p className={styles.sideDesc}>{active.description}</p>
              </div>

              <div className={styles.sideCard}>
                <div className={styles.statList}>
                  <Stat k="Peak static shortfall" v={usdCompact(s.peakShortfallStatic)} tone="var(--coral-bright)" />
                  <Stat k="PegShield shortfall" v={usd(s.peakShortfallDynamic)} tone="var(--emerald)" />
                  <Stat
                    k="Peak shortfall avoided"
                    v={lossPrevented > 0 ? usdCompact(lossPrevented) : "—"}
                    tone={lossPrevented > 0 ? "var(--emerald)" : "var(--text-3)"}
                  />
                  <Stat k="Deepest peg" v={signedPct(deepestPeg, 1)} />
                  <Stat k="Peak LTV cut" v={`−${pp(s.peakLtvCut, 0)}`} />
                  <Stat
                    k="Recovered"
                    v={s.recoveredToMonitoring ? "yes" : "no"}
                    tone={s.recoveredToMonitoring ? "var(--emerald)" : "var(--amber)"}
                  />
                </div>
              </div>

              <div className={styles.sideCard}>
                <div className={styles.highlights}>
                  {active.highlights.map((h, i) => (
                    <div className={styles.hi} key={i}>
                      <span className={styles.hiMark}><IconCheck /></span>
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
                {active.sources.length > 0 && (
                  <div className={styles.sources}>
                    {active.sources.map((src, i) => (
                      <a
                        key={i}
                        className={styles.sourceLink}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {src.label} <IconExternal />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statRowK}>{k}</span>
      <span className={styles.statRowV} style={tone ? { color: tone } : undefined}>
        {v}
      </span>
    </div>
  );
}
