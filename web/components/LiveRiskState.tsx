"use client";

import { useRiskState } from "./RiskStateProvider";
import { useMounted, useNowSeconds } from "@/lib/hooks";
import { SectionHead, AddressChip } from "./ui";
import { IconExternal } from "./Brand";
import {
  STATUS_META,
  DEFAULT_FALLBACK_LTV,
  deriveStatus,
  PROGRAM_ID,
  MSOL_PDA,
  UPDATER_AUTHORITY,
  explorerAddress,
} from "@/lib/constants";
import type { ResolvedRiskState } from "@/lib/types";
import { pct, pp, relativeAge, fmtDate, signedPct } from "@/lib/format";
import styles from "./LiveRiskState.module.css";

function IconRefresh({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={spinning ? styles.spin : ""}
    >
      <path
        d="M13 8a5 5 0 1 1-1.46-3.54M13 3v2.2h-2.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LtvGauge({ value, tone }: { value: number; tone: string }) {
  // Top semicircle gauge: 0% (left) → 100% (right). Exact length = π·R.
  const R = 84;
  const LEN = Math.PI * R;
  const frac = Math.max(0, Math.min(1, value));
  const ARC = `M 16 104 A ${R} ${R} 0 0 1 184 104`;
  return (
    <div className={styles.gauge}>
      <svg
        width="200"
        height="116"
        viewBox="0 0 200 116"
        aria-hidden="true"
        className={styles.gaugeSvg}
      >
        <path d={ARC} fill="none" stroke="var(--surface-hi)" strokeWidth="9" strokeLinecap="round" />
        <path
          d={ARC}
          fill="none"
          stroke={tone}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={LEN}
          strokeDashoffset={LEN * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.7s var(--ease), stroke 0.4s var(--ease)" }}
        />
      </svg>
      <span className={styles.gaugeValue} style={{ color: tone }}>
        {pct(value, 2)}
      </span>
      <span className={styles.gaugeLabel}>published LTV</span>
    </div>
  );
}

function Metric({
  k,
  v,
  hint,
  tone,
}: {
  k: string;
  v: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricK}>{k}</span>
      <span className={styles.metricV} style={tone ? { color: tone } : undefined}>
        {v}
      </span>
      {hint ? <span className={styles.metricHint}>{hint}</span> : null}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className={styles.grid}>
      <div className={styles.card} style={{ minHeight: 360, padding: 28 }}>
        <div className={styles.skel} style={{ height: 20, width: "50%" }} />
        <div className={styles.skel} style={{ height: 120, width: "100%", marginTop: 28, borderRadius: 12 }} />
        <div className={styles.skel} style={{ height: 60, width: "100%", marginTop: 24, borderRadius: 12 }} />
      </div>
      <div className={styles.card} style={{ minHeight: 360, padding: 28 }}>
        <div className={styles.skel} style={{ height: 20, width: "30%" }} />
        <div className={styles.skel} style={{ height: 200, width: "100%", marginTop: 24, borderRadius: 12 }} />
      </div>
    </div>
  );
}

function ErrorCard({ retry }: { retry: () => void }) {
  return (
    <div className={`${styles.card} ${styles.errorCard}`} role="alert">
      <div>
        <div className={styles.errorTitle}>RiskState could not be loaded</div>
        <p className={styles.errorBody}>
          The page could not reach its RiskState endpoint. No LTV is shown because
          treating a failed read as healthy would be unsafe.
        </p>
      </div>
      <button type="button" className={styles.refreshBtn} onClick={retry}>
        <IconRefresh /> Retry read
      </button>
    </div>
  );
}

function Body({ data }: { data: ResolvedRiskState }) {
  const { reload, refreshing } = useRiskState();
  const nowSec = useNowSeconds();
  const live = data.source === "live-devnet";
  const critical = data.regimeFlag === 1;

  const onchainAge = Math.max(0, nowSec - data.timestamp);
  const status = live
    ? deriveStatus(data.regimeFlag, data.timestamp, nowSec)
    : "unknown";
  const stale = status === "stale";
  const statusMeta = live ? STATUS_META[status] : STATUS_META.watch;
  const gaugeTone = statusMeta.tone;
  const guardLtv = stale || critical ? DEFAULT_FALLBACK_LTV : data.suggestedLtv;
  const fetchedSec = Math.floor(new Date(data.fetchedAt).getTime() / 1000);
  const checkedAge = Math.max(0, nowSec - fetchedSec);

  return (
    <div className={styles.grid}>
      {/* PRIMARY */}
      <div className={styles.card}>
        <div className={styles.primary}>
          <div className={styles.assetRow}>
            <div className={styles.asset}>
              <span className={styles.assetName}>{data.assetDisplayName}</span>
              <span className={styles.assetSub}>{data.lstId} · RiskState PDA</span>
            </div>
            {live ? (
              <span className={`pill ${statusMeta.pillClass}`}>
                <span className={`pill-dot ${status === "healthy" ? "live-dot" : ""}`} />
                Live read · {stale ? "Stale value" : statusMeta.label}
              </span>
            ) : (
              <span className="pill is-watch">
                <span className="pill-dot" />
                Offline snapshot
              </span>
            )}
          </div>

          <LtvGauge value={data.suggestedLtv} tone={gaugeTone} />

          <div className={styles.guardDecision}>
            <div>
              <span className={styles.guardK}>Default SDK guard</span>
              <span className={styles.guardHint}>
                {live
                  ? stale
                    ? "stale → fallback_ltv"
                    : critical
                      ? "CRITICAL → fallback_ltv"
                      : "fresh + NORMAL"
                  : "snapshot is not actionable"}
              </span>
            </div>
            <span
              className={styles.guardV}
              style={{ color: live ? statusMeta.tone : "var(--text-3)" }}
            >
              {live ? pct(guardLtv, 2) : "—"}
            </span>
          </div>

          <div className={styles.freshRow}>
            <div className={styles.freshItem}>
              <span className={styles.freshK}>{live ? "Checked via RPC" : "Snapshot loaded"}</span>
              <span className={styles.freshV} style={{ color: live ? "var(--emerald)" : "var(--amber)" }}>
                {checkedAge < 8 ? "just now" : relativeAge(checkedAge)}
              </span>
            </div>
            <div className={styles.freshItem}>
              <span className={styles.freshK}>On-chain publish</span>
              <span className={styles.freshV}>
                {data.timestamp ? fmtDate(new Date(data.timestamp * 1000).toISOString()) : "never"}
              </span>
            </div>
            <div className={styles.freshItem}>
              <span className={styles.freshK}>Slot</span>
              <span className={styles.freshV}>{data.slot ? data.slot.toLocaleString() : "—"}</span>
            </div>
          </div>

          {live && stale ? (
            <div className={styles.staleNote}>
              <span aria-hidden="true">⚠</span>
              <span>
                The account was read live, but its value was published {relativeAge(onchainAge)}
                {" "}— beyond the SDK’s 10-minute freshness window. <span className="mono">safeLtv()</span>{" "}
                returns the {pct(DEFAULT_FALLBACK_LTV, 0)} fallback; do not apply the raw{" "}
                {pct(data.suggestedLtv, 2)} to a new borrow.
              </span>
            </div>
          ) : critical ? (
            <div className={`${styles.staleNote} ${styles.crit}`}>
              <span aria-hidden="true">⚠</span>
              <span>
                Regime is CRITICAL — <span className="mono">safeLtv()</span> returns the{" "}
                {pct(DEFAULT_FALLBACK_LTV, 0)} fallback; a stricter Gate policy can halt
                new borrows.
              </span>
            </div>
          ) : (
            <div className={styles.infoNote}>
              <span aria-hidden="true" className={styles.infoDot} />
              <span>
                {live ? (
                  <>
                    Live read succeeded and the account is inside the default
                    10-minute freshness window. Consumer protocols still enforce
                    their own caps and fallback policy.
                  </>
                ) : (
                  <>
                    Devnet RPC was unavailable, so this is the committed verified
                    snapshot from the repository. Press Refresh to retry the live read.
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* DETAIL */}
      <div className={`${styles.card} ${styles.detail}`}>
        <div className={styles.detailHead}>
          <span className={styles.detailTitle}>Model &amp; source diagnostics</span>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={reload}
            disabled={refreshing}
          >
            <IconRefresh spinning={refreshing} />
            {refreshing ? "Reading…" : "Refresh"}
          </button>
        </div>

        <div className={styles.metricGroup}>
          {live ? "On-chain account fields · live RPC read" : "Committed snapshot fields"}
        </div>
        <div className={styles.metrics}>
          <Metric
            k="Regime"
            v={data.regimeFlag === 1 ? "CRITICAL" : "NORMAL"}
            tone={data.regimeFlag === 1 ? "var(--coral)" : "var(--emerald)"}
          />
          <Metric k="Published LTV" v={pct(data.suggestedLtv, 2)} hint="raw account value" />
          <Metric
            k="Guard-applied LTV"
            v={live ? pct(guardLtv, 2) : "—"}
            hint={live ? (stale ? "stale fallback" : critical ? "critical fallback" : "fresh value") : "requires live state"}
            tone={live ? statusMeta.tone : undefined}
          />
          <Metric k="Z-score" v={data.zScore.toFixed(4)} hint="spread vs window" />
          <Metric k="θ  mean-reversion" v={data.theta.toFixed(3)} hint="OU speed" />
          <Metric k="σ  volatility" v={data.sigma.toFixed(4)} hint="OU sigma" />
        </div>

        <div className={styles.metricGroup}>
          {live ? "Off-chain artifact context · not decoded from the PDA" : "Artifact diagnostics"}
        </div>
        <div className={styles.metrics}>
          <Metric
            k="Peg deviation"
            v={
              data.pegDeviationPct === null
                ? "—"
                : signedPct(data.pegDeviationPct, 3)
            }
          />
          <Metric
            k="Statistical LTV"
            v={data.statisticalLtv === null ? "—" : pct(data.statisticalLtv, 2)}
            hint="pre-haircut"
          />
          <Metric
            k="Data quality"
            v={data.dataQualityStatus ?? "—"}
            tone={data.dataQualityStatus === "WATCH" ? "var(--amber)" : undefined}
            hint={
              data.dataQualityHaircut != null && data.dataQualityHaircut > 0
                ? `−${pp(data.dataQualityHaircut, 2)} haircut`
                : undefined
            }
          />
          <Metric k="Liquidity" v={data.liquidityStatus ?? "—"} hint="exit depth" />
          <Metric k="Reference rate" v={data.referenceRateSource ?? "—"} />
        </div>

        <div className={styles.chain}>
          <div className={styles.chainRow}>
            <span className={styles.chainK}>Program</span>
            <AddressChip address={data.programId || PROGRAM_ID} />
          </div>
          <div className={styles.chainRow}>
            <span className={styles.chainK}>RiskState PDA</span>
            <AddressChip address={data.riskStatePda || MSOL_PDA} />
          </div>
          <div className={styles.chainRow}>
            <span className={styles.chainK}>Updater authority</span>
            <AddressChip address={data.authority || UPDATER_AUTHORITY} />
          </div>
        </div>

        <div className={styles.sourceFoot}>
          <span
            className="pill-dot"
            style={{ background: statusMeta.tone, width: 7, height: 7 }}
          />
          <span>
            {live
              ? stale
                ? "Live RPC read via @pegshield/sdk · published value is stale"
                : "Live read from Solana devnet via @pegshield/sdk"
              : "Offline verified snapshot — devnet RPC unavailable"}
          </span>
          <a
            href={explorerAddress(data.riskStatePda || MSOL_PDA)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: "auto", color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            Solana Explorer <IconExternal />
          </a>
        </div>
      </div>
    </div>
  );
}

export function LiveRiskState() {
  const { data, loadState, reload } = useRiskState();
  const mounted = useMounted();

  return (
    <section className="section" id="live" style={{ paddingTop: 0 }}>
      <div className="container">
        <SectionHead
          kicker="Solana devnet account"
          title={
            <>
              The RiskState a lender actually reads.
            </>
          }
          lede="This page reads the on-chain account through the same @pegshield/sdk a protocol would use. When devnet RPC is unavailable it falls back to a committed snapshot — and it always tells you which one you’re looking at."
        />
        <div className={styles.wrap}>
          {!mounted || loadState === "loading" ? (
            <LoadingCard />
          ) : loadState === "error" && !data ? (
            <ErrorCard retry={reload} />
          ) : data ? (
            <Body data={data} />
          ) : (
            <ErrorCard retry={reload} />
          )}
        </div>
      </div>
    </section>
  );
}
