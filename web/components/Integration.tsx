import { Reveal, SectionHead, CopyButton } from "./ui";
import styles from "./Integration.module.css";

const SNIPPET = `import { Connection } from "@solana/web3.js";
import { fetchRiskState, safeLtv } from "@pegshield/sdk";

const connection = new Connection(rpcUrl, "confirmed");
const { state } = await fetchRiskState(connection, { lstId: "mSOL-v2" });

// Stale or CRITICAL -> conservative fallback, never a higher LTV.
const ltv = safeLtv(state, { fallbackLtv: 0.40, maxLtv: 0.85 });
const maxBorrowUsd = collateralUsd * ltv;`;

const GATE_ROWS: { cond: string; detail: string; behavior: string; cls: string }[] = [
  { cond: "Healthy oracle", detail: "fresh, NORMAL regime", behavior: "min(suggested_ltv, policy max)", cls: "allow" },
  { cond: "Stale oracle", detail: "age > max_oracle_age", behavior: "fallback_ltv_bps", cls: "fallback" },
  { cond: "CRITICAL + halt", detail: "halt_on_critical = true", behavior: "REJECT new borrows", cls: "reject" },
  { cond: "CRITICAL + no halt", detail: "halt_on_critical = false", behavior: "fallback_ltv_bps", cls: "fallback" },
  { cond: "Paused policy", detail: "admin pause", behavior: "REJECT new borrows", cls: "reject" },
];

export function Integration() {
  return (
    <section className="section" id="integrate">
      <div className="container">
        <SectionHead
          kicker="For protocol teams"
          title="Adopt the read, the gate, or both."
          lede="PegShield is a feed and a borrow-path primitive. Consume the RiskState through a typed SDK, enforce it on-chain with the PegShield Gate, or evaluate the planned managed-feed path. The protocol always keeps its own max cap and fallback."
        />

        <div className={styles.grid}>
          <Reveal className={styles.code}>
            <div className={styles.codeHead}>
              <div className={styles.codeDots}>
                <span className={styles.codeDot} />
                <span className={styles.codeDot} />
                <span className={styles.codeDot} />
              </div>
              <span className={styles.codeFile}>borrow-gate.ts</span>
              <CopyButton value={SNIPPET} label="Copy integration snippet" />
            </div>
            <pre className={styles.codeBody}>
              <code>
                <span className={styles.line}>
                  <span className={styles.kw}>import</span> {"{ Connection }"}{" "}
                  <span className={styles.kw}>from</span>{" "}
                  <span className={styles.str}>&quot;@solana/web3.js&quot;</span>;
                </span>
                <span className={styles.line}>
                  <span className={styles.kw}>import</span> {"{ fetchRiskState, safeLtv }"}{" "}
                  <span className={styles.kw}>from</span>{" "}
                  <span className={styles.str}>&quot;@pegshield/sdk&quot;</span>;
                </span>
                <span className={styles.line}> </span>
                <span className={styles.line}>
                  <span className={styles.kw}>const</span> connection ={" "}
                  <span className={styles.kw}>new</span>{" "}
                  <span className={styles.fn}>Connection</span>(rpcUrl,{" "}
                  <span className={styles.str}>&quot;confirmed&quot;</span>);
                </span>
                <span className={styles.line}>
                  <span className={styles.kw}>const</span> {"{ state }"} ={" "}
                  <span className={styles.kw}>await</span>{" "}
                  <span className={styles.fn}>fetchRiskState</span>(connection,{" "}
                  {"{ lstId: "}
                  <span className={styles.str}>&quot;mSOL-v2&quot;</span>
                  {" }"});
                </span>
                <span className={styles.line}> </span>
                <span className={styles.line + " " + styles.cmt}>
                  {"// Stale or CRITICAL -> conservative fallback, never higher."}
                </span>
                <span className={styles.line}>
                  <span className={styles.kw}>const</span> ltv ={" "}
                  <span className={styles.fn}>safeLtv</span>(state,{" "}
                  {"{ fallbackLtv: "}
                  <span className={styles.num}>0.40</span>
                  {", maxLtv: "}
                  <span className={styles.num}>0.85</span>
                  {" }"});
                </span>
                <span className={styles.line}>
                  <span className={styles.kw}>const</span> maxBorrowUsd ={" "}
                  collateralUsd <span className={styles.punc}>*</span> ltv;
                </span>
              </code>
            </pre>
          </Reveal>

          <div className={styles.tiers}>
            {[
              {
                t: "SDK read",
                b: (
                  <>
                    Decode <code>RiskState</code>, check <code>isStale</code> /{" "}
                    <code>isCritical</code>, apply <code>safeLtv</code>. Owner and
                    freshness are verified for you.
                  </>
                ),
              },
              {
                t: "On-chain Gate",
                b: (
                  <>
                    Use PegShield Gate as a borrow-policy module: it reads a{" "}
                    <code>BorrowPolicy</code> + <code>RiskState</code> and records an
                    auditable <code>BorrowDecision</code> PDA.
                  </>
                ),
              },
              {
                t: "Managed feed (planned)",
                b: (
                  <>
                    A production option for PegShield to operate updates, attesters,
                    monitoring, and an SLA once the mainnet controls are ready.
                  </>
                ),
              },
            ].map((tier, i) => (
              <Reveal as="div" className={styles.tier} key={tier.t} delay={i * 70}>
                <div className={styles.tierHead}>
                  <span className={styles.tierNum}>{i + 1}</span>
                  <span className={styles.tierTitle}>{tier.t}</span>
                </div>
                <p className={styles.tierBody}>{tier.b}</p>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal className={styles.gate}>
          <div className={styles.gateHead}>
            <div>
              <div className={styles.gateTitle}>PegShield Gate — asymmetric by design</div>
              <div className={styles.gateSub}>
                It can tighten credit instantly, but only the protocol can loosen it.
              </div>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className={styles.gateTable}>
              <thead>
                <tr>
                  <th>Oracle condition</th>
                  <th>Trigger</th>
                  <th>Gate behavior</th>
                </tr>
              </thead>
              <tbody>
                {GATE_ROWS.map((r) => (
                  <tr key={r.cond}>
                    <td>{r.cond}</td>
                    <td style={{ color: "var(--text-faint)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      {r.detail}
                    </td>
                    <td>
                      <span className={`${styles.gateVal} ${styles[r.cls as "allow"]}`}>
                        {r.behavior}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
