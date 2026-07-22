import { Reveal, SectionHead } from "./ui";
import { IconCheck } from "./Brand";
import styles from "./TrustLimits.module.css";

const LIVE = [
  <>Anchor <b>risk_oracle</b> program deployed to Solana devnet, with a <b>RiskState</b> PDA per LST.</>,
  <>Full off-chain pipeline: Pyth ingestion, reference-rate normalization, OU + ADF + z-score, liquidity &amp; data-quality haircuts.</>,
  <>Typed <b>@pegshield/sdk</b>, unified operator CLI, a runnable lender reference, and the on-chain <b>PegShield Gate</b>.</>,
  <>Multi-attester registry, propose / confirm / dispute / slash flow, and a deterministic 2-of-3 finalization proof — in code.</>,
  <>Nine-scenario stress suite including a real June 2022 stETH/ETH depeg replay.</>,
];

const BOUNDS = [
  <><b>Devnet only.</b> Mainnet is intentionally deferred until funding, legal structure, monitoring, and attester custody are ready.</>,
  <><b>Not audited.</b> No external security review has been completed.</>,
  <><b>No production lender integration yet.</b> The reference consumer and Gate are the integration path, not a signed deployment.</>,
  <><b>Single-attester trust assumption.</b> Independent production attesters are not yet operating; today one authority signs updates.</>,
  <><b>No production alerting stack yet.</b> Monitoring is part of the mainnet-readiness checklist.</>,
];

export function TrustLimits() {
  return (
    <section className="section" id="trust">
      <div className="container">
        <SectionHead
          kicker="Trust model"
          title="What’s real today — and what isn’t."
          lede="Risk infrastructure earns trust by being precise about its own limits. Here is exactly what is live, and exactly where the boundaries are."
        />

        <div className={styles.grid}>
          <Reveal className={styles.col}>
            <div className={styles.colHead}>
              <span className="pill is-healthy" style={{ height: 26 }}>
                <span className="pill-dot" /> Working today
              </span>
            </div>
            <div className={styles.list}>
              {LIVE.map((t, i) => (
                <div className={styles.item} key={i}>
                  <span className={`${styles.mark} ${styles.markLive}`}>
                    <IconCheck />
                  </span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal className={styles.col} delay={90}>
            <div className={styles.colHead}>
              <span className="pill is-watch" style={{ height: 26 }}>
                <span className="pill-dot" /> Boundaries
              </span>
            </div>
            <div className={styles.list}>
              {BOUNDS.map((t, i) => (
                <div className={styles.item} key={i}>
                  <span className={`${styles.mark} ${styles.markBound}`} aria-hidden="true">
                    ○
                  </span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal className={styles.attester}>
          <span className={styles.attesterIcon} aria-hidden="true">◆</span>
          <div>
            <div className={styles.attesterTitle}>
              The single-attester assumption is the one to watch
            </div>
            <p className={styles.attesterBody}>
              Today a single authority keypair signs every update, gated on-chain by{" "}
              <code>has_one = authority</code> and a 30-second rate limit. The program
              already ships the decentralization path — a bonded{" "}
              <code>AttesterRegistry</code> where attesters propose and confirm updates,
              bad updates are disputable, and slashed bond is split between the disputer
              and the treasury. Moving that from code to an operating committee is the
              gate to production.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
