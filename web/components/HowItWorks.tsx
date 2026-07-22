import { Reveal, SectionHead } from "./ui";
import styles from "./HowItWorks.module.css";

const NODES = [
  { name: "Pyth Hermes", desc: "LST & SOL USD prices with confidence intervals.", out: "asset_usd · sol_usd", tone: "var(--indigo)" },
  { name: "Bridge", desc: "Adds each LST’s canonical staking rate; computes peg deviation.", out: "peg_deviation", tone: "var(--indigo)" },
  { name: "Core engine", desc: "OU calibration, ADF stationarity, z-score, LTV map + haircuts.", out: "suggested_ltv", tone: "var(--emerald)" },
  { name: "Updater", desc: "Signs & submits a rate-limited Anchor transaction.", out: "update_risk_state", tone: "var(--emerald)" },
  { name: "RiskState PDA", desc: "Compact on-chain account, one per lst_id.", out: "on-chain", tone: "var(--emerald)" },
  { name: "Lender", desc: "Reads via SDK or the on-chain Gate; enforces in the borrow path.", out: "borrow decision", tone: "var(--text-2)" },
];

export function HowItWorks() {
  return (
    <section className="section" id="how">
      <div className="container">
        <SectionHead
          kicker="Under the hood"
          title="From a Pyth tick to an enforceable LTV."
          lede="A disciplined off-chain pipeline does the statistics; the chain stores only a compact, signed result. Consumers never trust the math blind — every artifact is committed back to the repo so any reviewer can replay it."
        />

        <Reveal className={styles.pipe}>
          {NODES.map((n, i) => (
            <div className={styles.node} key={n.name}>
              <span className={styles.nodeIdx}>{String(i + 1).padStart(2, "0")}</span>
              <span className={styles.nodeName}>
                <span className={styles.nodeDot} style={{ background: n.tone }} />
                {n.name}
              </span>
              <span className={styles.nodeDesc}>{n.desc}</span>
              <span className={styles.nodeOut}>{n.out}</span>
            </div>
          ))}
        </Reveal>

        <Reveal className={styles.formula} delay={80}>
          <math
            className={styles.formulaEquation}
            display="block"
            aria-label="Peg deviation equals the asset USD price divided by the SOL USD price, divided by the reference rate, minus one"
          >
            <mrow>
              <msub className={styles.equationLhs}>
                <mi>peg</mi>
                <mi>deviation</mi>
              </msub>
              <mo>=</mo>
              <mfrac>
                <mfrac>
                  <msub>
                    <mi>asset</mi>
                    <mi>usd</mi>
                  </msub>
                  <msub>
                    <mi>sol</mi>
                    <mi>usd</mi>
                  </msub>
                </mfrac>
                <msub>
                  <mi>reference</mi>
                  <mi>rate</mi>
                </msub>
              </mfrac>
              <mo>−</mo>
              <mn>1</mn>
            </mrow>
          </math>
          <span className={styles.formulaNote}>
            LSTs drift upward vs SOL as staking yield accrues, so PegShield measures
            deviation from the canonical staking rate — not raw USD spread.
          </span>
        </Reveal>

        <div className={styles.layers}>
          <Reveal as="div" className={styles.layer}>
            <span className={styles.layerNum}>01 · signal</span>
            <span className={styles.layerTitle}>Peg, not price</span>
            <p className={styles.layerBody}>
              A healthy peg sits near zero and mean-reverts; a real depeg drives it
              meaningfully negative. This separates staking-yield drift from genuine
              impairment.
            </p>
            <div className={styles.layerTags}>
              <span className={styles.tag}>Marinade</span>
              <span className={styles.tag}>Jito</span>
              <span className={styles.tag}>SolBlaze</span>
            </div>
          </Reveal>

          <Reveal as="div" className={styles.layer} delay={80}>
            <span className={styles.layerNum}>02 · model</span>
            <span className={styles.layerTitle}>Regime, not gut feel</span>
            <p className={styles.layerBody}>
              An <code>Ornstein–Uhlenbeck</code> process fits mean-reversion speed θ
              and volatility σ over a rolling window; an <code>ADF</code> test plus a
              z-score flag when the spread stops behaving like noise and becomes a
              trend.
            </p>
            <div className={styles.layerTags}>
              <span className={styles.tag}>θ mean-reversion</span>
              <span className={styles.tag}>σ volatility</span>
              <span className={styles.tag}>ADF + z-score</span>
            </div>
          </Reveal>

          <Reveal as="div" className={styles.layer} delay={160}>
            <span className={styles.layerNum}>03 · guardrails</span>
            <span className={styles.layerTitle}>Missing data ≠ safe</span>
            <p className={styles.layerBody}>
              Thin exit liquidity, wide price confidence, or a fallback reference
              rate each apply a bounded haircut. If the inputs degrade, the
              suggested LTV tightens — even when the peg itself looks calm.
            </p>
            <div className={styles.layerTags}>
              <span className={styles.tag}>liquidity haircut</span>
              <span className={styles.tag}>data-quality haircut</span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
