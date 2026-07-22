export type RegimeFlag = 0 | 1;
export type RiskStatus = "healthy" | "watch" | "critical" | "stale" | "unknown";
export type DataSource = "live-devnet" | "offline-snapshot" | "committed-scenario";

/** Lean per-LST oracle snapshot committed from repo artifacts (web/data/snapshots.json). */
export interface OracleSnapshot {
  lstId: string;
  assetSymbol: string;
  assetDisplayName: string;
  baseSymbol: string;
  theta: number;
  sigma: number;
  zScore: number;
  regimeFlag: RegimeFlag;
  statisticalLtv: number;
  suggestedLtv: number;
  pegDeviationPct: number;
  spreadPct: number;
  assetPrice: number;
  solPrice: number;
  referenceRate: number;
  referenceRateSource: string;
  liquidityRisk: { status: string; haircut: number };
  dataQualityRisk: {
    status: string;
    haircut: number;
    historySource: string | null;
    referenceRateSource: string | null;
  };
  status: string;
  timestamp: number;
  updatedAtIso: string;
  source: string;
  programId: string;
  riskStatePda: string;
  authority: string;
  network: string;
}

export interface SnapshotsFile {
  generatedFrom: string;
  note: string;
  snapshots: OracleSnapshot[];
}

/** The shape returned by /api/riskstate — a resolved risk state plus provenance. */
export interface ResolvedRiskState {
  source: DataSource;
  /** Human label for the source, e.g. "Solana devnet" / "offline verified snapshot". */
  sourceLabel: string;
  fetchedAt: string;
  /** ISO timestamp when the underlying state or artifact was produced. */
  producedAtIso: string | null;
  lstId: string;
  assetSymbol: string;
  assetDisplayName: string;
  baseSymbol: string;
  suggestedLtv: number;
  suggestedLtvBps: number;
  statisticalLtv: number | null;
  regimeFlag: RegimeFlag;
  theta: number;
  sigma: number;
  zScore: number;
  pegDeviationPct: number | null;
  /** Unix seconds of the on-chain / snapshot update. */
  timestamp: number;
  slot: number | null;
  dataQualityStatus: string | null;
  dataQualityHaircut: number | null;
  liquidityStatus: string | null;
  referenceRateSource: string | null;
  programId: string;
  riskStatePda: string;
  authority: string;
  lastUpdater: string | null;
  network: string;
  /** Present only when the live fetch failed and we fell back. */
  liveError: string | null;
}

// ---- Stress scenarios --------------------------------------------------------
export interface ScenarioPoint {
  timestamp: string;
  spread_pct: number;
  peg_deviation: number;
  z_score: number;
  regime_flag: number;
  ltv_with_oracle: number;
  ltv_no_oracle: number;
  shortfall_dynamic: number;
  shortfall_static: number;
}

export interface ScenarioSummary {
  rowCount: number;
  maxZScore: number;
  minSpreadPct: number;
  criticalRows: number;
  criticalDurationRatio: number;
  peakShortfallStatic: number;
  peakShortfallDynamic: number;
  finalLossPrevented: number;
  maxLossPrevented: number;
  peakLtvCut: number;
  finalDynamicLtv: number;
  finalStaticLtv: number;
  recoveredToMonitoring: boolean;
}

export interface Scenario {
  id: string;
  kind: string;
  title: string;
  description: string;
  assetSymbol: string;
  baseSymbol: string;
  eventWindowLabel: string;
  tagline: string;
  riskFocus: string;
  highlights: string[];
  sources: { label: string; url: string }[];
  summary: ScenarioSummary;
  points: ScenarioPoint[];
}

export interface StressFile {
  generatedFrom: string;
  defaultScenarioId: string;
  scenarios: Scenario[];
}
