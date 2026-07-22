import { Reveal, SectionHead } from "./ui";
import styles from "./Distinction.module.css";

export function Distinction() {
  return (
    <section className="section" id="why">
      <div className="container">
        <SectionHead
          kicker="The distinction"
          title={
            <>
              A price is not a risk decision.
            </>
          }
          lede="Every LST lending market already has a price oracle. PegShield answers the question a price can't: given how this collateral is behaving right now, should new credit keep flowing — and at what LTV?"
        />

        <div className={styles.grid}>
          <Reveal className={`${styles.card} ${styles.oracle}`}>
            <span className={styles.tag}>
              <span className={styles.tagDot} style={{ background: "var(--indigo)" }} />
              PRICE ORACLE
            </span>
            <p className={styles.q}>
              “What is one mSOL <span className={styles.qMuted}>worth</span> right now?”
            </p>
            <p className={styles.body}>
              Streams a USD price and confidence. Essential for valuation and
              liquidation math — but a price alone says nothing about whether the
              peg is holding, whether exit liquidity exists, or whether the feed
              itself is degrading.
            </p>
            <div className={styles.answerRow}>
              <span className={styles.answerLabel}>Output</span>
              <span className={styles.answerValue}>A number. The lender still decides what to do with it.</span>
            </div>
          </Reveal>

          <Reveal className={`${styles.card} ${styles.shield}`} delay={90}>
            <span className={styles.tag}>
              <span className={styles.tagDot} style={{ background: "var(--emerald)" }} />
              PEGSHIELD
            </span>
            <p className={styles.q}>
              “Should we keep <span style={{ color: "var(--emerald)" }}>lending</span> against it, and how much?”
            </p>
            <p className={styles.body}>
              Continuously measures peg deviation against each LST’s canonical
              staking rate, calibrates a statistical model over that signal, and
              folds in liquidity and data-quality haircuts — then publishes a
              single enforceable LTV on-chain.
            </p>
            <div className={styles.answerRow}>
              <span className={styles.answerLabel}>Output</span>
              <span className={styles.answerValue}>
                An on-chain <span className="mono">suggested_ltv_bps</span> + regime the borrow path can enforce.
              </span>
            </div>
          </Reveal>
        </div>

        <Reveal className={styles.bridge}>
          <span>
            <b>They are complementary.</b> A price oracle is an input to PegShield.
            PegShield turns that input, plus peg and liquidity signals, into the
            one decision a lending market has to make on every borrow.
          </span>
        </Reveal>
      </div>
    </section>
  );
}
