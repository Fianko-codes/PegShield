"use client";

import { PegBand } from "./PegBand";
import { IconArrow } from "./Brand";
import { useRiskState } from "./RiskStateProvider";
import { useNowSeconds } from "@/lib/hooks";
import { deriveStatus, STATUS_META } from "@/lib/constants";
import styles from "./Hero.module.css";

function DevnetMeta() {
  const { data } = useRiskState();
  const nowSec = useNowSeconds();
  const live = data?.source === "live-devnet";
  const status = data && live
    ? deriveStatus(data.regimeFlag, data.timestamp, nowSec)
    : "unknown";
  const tone = !data
    ? "var(--text-faint)"
    : !live
      ? "var(--amber)"
      : STATUS_META[status].tone;
  return (
    <div className={styles.meta}>
      <span className={styles.metaItem}>
        <span
          className={`pill-dot ${live && status === "healthy" ? "live-dot" : ""}`}
          style={{ background: tone, color: tone }}
        />
        {data
          ? live
            ? status === "stale"
              ? "Devnet read · stale value"
              : `Live on Solana devnet · ${STATUS_META[status].label}`
            : "Offline verified snapshot"
          : "Connecting to devnet…"}
      </span>
      <span className={styles.metaItem}>
        <span className={styles.metaDot} /> mSOL-v2 · jitoSOL-v1 · bSOL-v1
      </span>
      <span className={styles.metaItem}>
        <span className={styles.metaDot} /> Not audited · devnet only
      </span>
    </div>
  );
}

export function Hero() {
  return (
    <section className={styles.hero} id="top">
      <div className="container">
        <div className={styles.grid}>
          <div className={styles.copy}>
            <span className="kicker">Solana-native collateral risk</span>
            <h1 className={styles.headline}>
              Oracles price collateral.
              <br />
              <span className={styles.keyline}>PegShield</span> decides whether to
              keep <span className={styles.fade}>lending against it.</span>
            </h1>
            <p className={styles.sub}>
              An on-chain circuit breaker prototype for LST lending. PegShield measures
              peg, liquidity, and data-quality risk, then publishes a suggested LTV
              that a protocol can enforce in the borrow path — faster than
              governance can react.
            </p>
            <div className={styles.ctas}>
              <a href="#demo" className="btn btn-primary">
                See the borrow decision <IconArrow />
              </a>
              <a href="#live" className="btn btn-ghost">
                Inspect the devnet RiskState
              </a>
            </div>
            <DevnetMeta />
          </div>

          <div className={styles.visual}>
            <div className={styles.visualHead}>
              <span className={styles.visualTitle}>peg_deviation → suggested LTV</span>
              <span className="pill is-neutral" style={{ height: 22 }}>
                <span className="pill-dot" style={{ background: "var(--emerald)" }} />
                model view
              </span>
            </div>
            <PegBand />
          </div>
        </div>
      </div>
    </section>
  );
}
