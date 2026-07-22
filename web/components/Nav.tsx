"use client";

import { useEffect, useState } from "react";
import { Wordmark, IconArrow } from "./Brand";
import { useRiskState } from "./RiskStateProvider";
import { useNowSeconds } from "@/lib/hooks";
import { deriveStatus, STATUS_META, REPO_URL } from "@/lib/constants";
import styles from "./Nav.module.css";

const LINKS = [
  { href: "#demo", label: "The decision" },
  { href: "#live", label: "Devnet state" },
  { href: "#evidence", label: "Evidence" },
  { href: "#how", label: "How it works" },
  { href: "#integrate", label: "Integrate" },
];

function LiveStatusPill() {
  const { data, loadState } = useRiskState();
  const nowSec = useNowSeconds();

  if (loadState === "loading" || !data) {
    return (
      <span className="pill is-neutral" aria-live="polite">
        <span className="pill-dot" style={{ opacity: 0.5 }} />
        <span className={styles.statusLabel}>Reading devnet…</span>
      </span>
    );
  }

  const live = data.source === "live-devnet";
  const status = live
    ? deriveStatus(data.regimeFlag, data.timestamp, nowSec)
    : "unknown";
  const meta = live ? STATUS_META[status] : STATUS_META.watch;

  return (
    <a
      href="#live"
      className={`pill ${meta.pillClass} ${styles.statusPill}`}
      aria-label={`mSOL-v2 RiskState: ${live ? meta.label : "offline snapshot"}`}
      title={
        live
          ? status === "stale"
            ? "Read live from Solana devnet; published value is stale"
            : `Live Solana devnet RiskState: ${meta.label}`
          : "Offline verified snapshot"
      }
    >
      <span className={`pill-dot ${live && status === "healthy" ? "live-dot" : ""}`} />
      <span className={styles.statusLabel}>
        mSOL-v2 · {live ? meta.label : "Snapshot"}
      </span>
    </a>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`${styles.nav} ${scrolled ? styles.scrolled : ""}`}>
      <div className="container">
        <div className={styles.inner}>
          <a href="#top" aria-label="PegShield — home">
            <Wordmark />
          </a>
          <nav className={styles.links} aria-label="Primary">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className={styles.link}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className={styles.right}>
            <LiveStatusPill />
            <a
              className="btn btn-ghost"
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open PegShield on GitHub"
            >
              <span className={styles.ctaText}>GitHub</span>
              <IconArrow />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
