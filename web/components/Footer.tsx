import { Wordmark, IconArrow, IconExternal } from "./Brand";
import { AddressChip } from "./ui";
import {
  REPO_URL,
  PROGRAM_ID,
  MSOL_PDA,
  UPDATER_AUTHORITY,
  explorerAddress,
} from "@/lib/constants";
import styles from "./Footer.module.css";

const DOC = (p: string) => `${REPO_URL}/blob/main/${p}`;

const PRODUCT_LINKS = [
  { href: "#demo", label: "The borrow decision" },
  { href: "#live", label: "Devnet RiskState" },
  { href: "#evidence", label: "Stress evidence" },
  { href: "#how", label: "How it works" },
  { href: "#integrate", label: "Integration" },
];

const DOC_LINKS = [
  { href: DOC("docs/ARCHITECTURE.md"), label: "Architecture" },
  { href: DOC("docs/INTEGRATION.md"), label: "Integration guide" },
  { href: DOC("docs/EVIDENCE.md"), label: "Evidence packet" },
  { href: DOC("SECURITY.md"), label: "Security & trust model" },
  { href: DOC("sdk/README.md"), label: "SDK reference" },
];

export function Footer() {
  return (
    <>
      <section className={styles.cta} id="cta">
        <div className="container">
          <div className={styles.ctaInner}>
            <span className="kicker">Evaluate PegShield</span>
            <h2 className={styles.ctaTitle}>
              Take the human out of the tighten loop.
            </h2>
            <p className={styles.ctaSub}>
              Read the devnet RiskState, run the deterministic policy proof, or
              wire the SDK into a shadow-mode borrow policy beside your existing
              collateral rules.
            </p>
            <div className={styles.ctaBtns}>
              <a className="btn btn-primary" href={REPO_URL} target="_blank" rel="noopener noreferrer">
                Explore the repository <IconArrow />
              </a>
              <a className="btn btn-ghost" href="#demo">
                Replay the decision
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className="container">
          <div className={styles.top}>
            <div className={styles.brandCol}>
              <Wordmark />
              <p className={styles.brandTag}>
                A Solana-native collateral circuit breaker for LST lending. It tells
                lenders whether to keep extending credit — and at what LTV.
              </p>
              <span className={styles.disc}>
                <span className="pill-dot" style={{ background: "var(--amber)" }} />
                Devnet only · Not audited
              </span>
            </div>

            <div>
              <div className={styles.colTitle}>Product</div>
              <nav className={styles.links}>
                {PRODUCT_LINKS.map((l) => (
                  <a key={l.href} href={l.href} className={styles.link}>
                    {l.label}
                  </a>
                ))}
              </nav>
            </div>

            <div>
              <div className={styles.colTitle}>Documentation</div>
              <nav className={styles.links}>
                {DOC_LINKS.map((l) => (
                  <a key={l.href} href={l.href} className={styles.link} target="_blank" rel="noopener noreferrer">
                    {l.label} <IconExternal />
                  </a>
                ))}
              </nav>
            </div>

            <div>
              <div className={styles.colTitle}>On-chain · devnet</div>
              <div className={styles.chainCol}>
                <div className={styles.chainRow}>
                  <span className={styles.chainK}>Program</span>
                  <AddressChip address={PROGRAM_ID} copyable={false} />
                </div>
                <div className={styles.chainRow}>
                  <span className={styles.chainK}>mSOL-v2 RiskState PDA</span>
                  <AddressChip address={MSOL_PDA} copyable={false} />
                </div>
                <div className={styles.chainRow}>
                  <span className={styles.chainK}>Updater authority</span>
                  <AddressChip address={UPDATER_AUTHORITY} copyable={false} />
                </div>
              </div>
            </div>
          </div>

          <div className={styles.bottom}>
            <span>
              © 2026 PegShield ·{" "}
              <a href={DOC("LICENSE")} target="_blank" rel="noopener noreferrer">
                Apache-2.0
              </a>{" "}
              · Built by{" "}
              <a href="https://github.com/Fianko-codes" target="_blank" rel="noopener noreferrer">
                @Fianko-codes
              </a>
            </span>
            <span>
              Current mSOL-v2 on-chain publish ·{" "}
              <a href={explorerAddress(MSOL_PDA)} target="_blank" rel="noopener noreferrer">
                Apr 24, 2026 ↗
              </a>
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
