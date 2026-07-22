// Derives the website's committed offline dataset from the real PegShield
// repository artifacts. This is the *only* place the site reads from `../artifacts`.
// The output in `web/data/` is what the site bundles and labels as the
// "offline verified snapshot" when live devnet RPC is unavailable.
//
// Run automatically before `dev` and `build` (see package.json), and committed
// so the site builds even without the parent artifacts present.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");
const ARTIFACTS = resolve(WEB_ROOT, "..", "artifacts");
const OUT = join(WEB_ROOT, "data");

const LSTS = ["mSOL-v2", "jitoSOL-v1", "bSOL-v1"];

// Keep reviewer-facing citations healthy when an original article moves or dies.
// This changes link presentation only; scenario points and summaries still come
// byte-for-byte from the committed artifact.
const SOURCE_OVERRIDES = new Map([
  [
    "https://www.poundsterlinglive.com/crypto-currency/ethereum-to-us-dollar-history-2022",
    {
      label: "Ethereum historical USD closes (CoinGecko)",
      url: "https://www.coingecko.com/en/coins/ethereum/historical_data",
    },
  ],
  [
    "https://coinscreed.com/lido-staked-ethereum-steth-price-falls-depegs-from-ethereum-trade-ratio/",
    {
      label: "June 10, 2022 stETH 5% discount",
      url: "https://www.theblock.co/post/151380/lido-staked-ether-steth-discount-drops-to-5-for-second-time-in-one-month",
    },
  ],
  [
    "https://www.cnbc.com/2022/06/20/steth-price-falls-further-away-from-ether-sparking-more-crypto-market-fear.html",
    {
      label: "Nansen analysis of the June 2022 stETH depeg",
      url: "https://research.nansen.ai/article/485",
    },
  ],
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function oracleFileFor(lstId) {
  return join(ARTIFACTS, `oracle_state.${lstId}.json`);
}

// If the parent artifacts are missing (e.g. the web folder was copied out of the
// monorepo), we keep whatever is already committed in web/data rather than fail.
if (!existsSync(ARTIFACTS)) {
  console.warn(
    `[build-data] ${ARTIFACTS} not found — keeping committed web/data as-is.`,
  );
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });

// ---- Per-LST oracle snapshots (lean, only fields the site renders) ----------
const snapshots = LSTS.map((lstId) => {
  const o = readJson(oracleFileFor(lstId));
  return {
    lstId: o.lst_id,
    assetSymbol: o.asset_symbol,
    assetDisplayName: o.asset_display_name,
    baseSymbol: o.base_symbol,
    theta: o.theta,
    sigma: o.sigma,
    zScore: o.z_score,
    regimeFlag: o.regime_flag,
    statisticalLtv: o.statistical_ltv,
    suggestedLtv: o.suggested_ltv,
    pegDeviationPct: o.peg_deviation_pct,
    spreadPct: o.spread_pct,
    assetPrice: o.asset_price,
    solPrice: o.sol_price,
    referenceRate: o.reference_rate,
    referenceRateSource: o.reference_rate_source,
    liquidityRisk: {
      status: o.liquidity_risk?.status ?? "UNKNOWN",
      haircut: o.liquidity_risk?.haircut ?? 0,
    },
    dataQualityRisk: {
      status: o.data_quality_risk?.status ?? "UNKNOWN",
      haircut: o.data_quality_risk?.haircut ?? 0,
      historySource: o.data_quality_risk?.inputs?.history_source ?? null,
      referenceRateSource:
        o.data_quality_risk?.inputs?.reference_rate_source ?? null,
    },
    status: o.status,
    timestamp: o.timestamp,
    updatedAtIso: o.updated_at_iso,
    source: o.source,
    programId: o.program_id,
    riskStatePda: o.risk_state_pda,
    authority: o.authority,
    network: o.network,
  };
});

writeFileSync(
  join(OUT, "snapshots.json"),
  JSON.stringify(
    {
      generatedFrom: "artifacts/oracle_state.<lst>.json",
      note: "Offline verified snapshot committed from repository oracle artifacts.",
      snapshots,
    },
    null,
    2,
  ) + "\n",
);

// ---- Stress scenario bundle (lean per-point series for charts) --------------
const stress = readJson(join(ARTIFACTS, "stress_scenario.json"));

const POINT_KEYS = [
  "timestamp",
  "spread_pct",
  "peg_deviation",
  "z_score",
  "regime_flag",
  "ltv_with_oracle",
  "ltv_no_oracle",
  "shortfall_dynamic",
  "shortfall_static",
];

const scenarios = stress.scenarios.map((s) => ({
  id: s.id,
  kind: s.kind,
  title: s.title,
  description: s.description,
  assetSymbol: s.asset_symbol,
  baseSymbol: s.base_symbol,
  eventWindowLabel: s.event_window_label,
  tagline: s.tagline,
  riskFocus: s.risk_focus,
  highlights: s.highlights,
  sources: (s.sources ?? []).map(
    (source) => SOURCE_OVERRIDES.get(source.url) ?? source,
  ),
  summary: {
    rowCount: s.summary.row_count,
    maxZScore: s.summary.max_z_score,
    minSpreadPct: s.summary.min_spread_pct,
    criticalRows: s.summary.critical_rows,
    criticalDurationRatio: s.summary.critical_duration_ratio,
    peakShortfallStatic: s.summary.peak_shortfall_static,
    peakShortfallDynamic: s.summary.peak_shortfall_dynamic,
    finalLossPrevented: s.summary.final_loss_prevented,
    maxLossPrevented: s.summary.max_loss_prevented,
    peakLtvCut: s.summary.peak_ltv_cut,
    finalDynamicLtv: s.summary.final_dynamic_ltv,
    finalStaticLtv: s.summary.final_static_ltv,
    recoveredToMonitoring: s.summary.recovered_to_monitoring,
  },
  points: s.points.map((p) => {
    const out = {};
    for (const k of POINT_KEYS) out[k] = p[k];
    return out;
  }),
}));

writeFileSync(
  join(OUT, "stress.json"),
  JSON.stringify(
    {
      generatedFrom: "artifacts/stress_scenario.json",
      defaultScenarioId: stress.default_scenario_id,
      scenarios,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `[build-data] wrote data/snapshots.json (${snapshots.length} LSTs) and data/stress.json (${scenarios.length} scenarios).`,
);
