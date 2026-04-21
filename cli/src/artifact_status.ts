export type OracleSnapshot = {
  lst_id: string;
  asset_symbol?: string;
  asset_display_name?: string;
  suggested_ltv: number;
  statistical_ltv?: number;
  peg_deviation_pct?: number | null;
  z_score: number;
  regime_flag: number;
  status?: string;
  timestamp: number;
  updated_at_iso?: string;
  analytics_status?: string;
  history_source?: string;
  reference_rate?: number | null;
  reference_rate_source?: string;
  liquidity_risk?: {
    status?: string;
    score?: number;
    haircut?: number;
    components?: Record<string, number>;
    inputs?: Record<string, number | null>;
  };
};

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function explainLtv(snapshot: OracleSnapshot): string[] {
  const reasons: string[] = [];
  const statisticalLtv = snapshot.statistical_ltv ?? snapshot.suggested_ltv;
  const liquidityRisk = snapshot.liquidity_risk ?? {};
  const liquidityHaircut = Number(liquidityRisk.haircut ?? 0);

  if (snapshot.regime_flag === 1) {
    reasons.push("Critical regime: model detected non-stationary stress and forced conservative LTV.");
  }
  if (liquidityHaircut > 0) {
    reasons.push(`Liquidity haircut reduced LTV by ${pct(liquidityHaircut)}.`);
  }
  if (snapshot.suggested_ltv < statisticalLtv && liquidityHaircut <= 0) {
    reasons.push("Suggested LTV is below statistical LTV due to model clamps or fallback policy.");
  }
  if (snapshot.suggested_ltv >= 0.8 && snapshot.regime_flag === 0 && liquidityHaircut === 0) {
    reasons.push("No active stress: statistical model is at the protocol cap and no liquidity haircut is active.");
  }
  if (snapshot.analytics_status && snapshot.analytics_status !== "trusted") {
    reasons.push("Historical analytics withheld because bridge history came from fallback cache.");
  }
  if (reasons.length === 0) {
    reasons.push("LTV follows the current OU volatility and mean-reversion signal.");
  }
  return reasons;
}

export function buildArtifactStatus(snapshot: OracleSnapshot, nowSeconds = Math.floor(Date.now() / 1000)) {
  const ageSeconds = Math.max(0, nowSeconds - Number(snapshot.timestamp));
  const liquidityRisk = snapshot.liquidity_risk ?? {
    status: "UNKNOWN",
    score: 0,
    haircut: 0,
    components: {},
    inputs: {},
  };

  return {
    lst_id: snapshot.lst_id,
    asset_symbol: snapshot.asset_symbol,
    asset_display_name: snapshot.asset_display_name,
    status: snapshot.status ?? "UNKNOWN",
    suggested_ltv: snapshot.suggested_ltv,
    statistical_ltv: snapshot.statistical_ltv ?? snapshot.suggested_ltv,
    peg_deviation_pct: snapshot.peg_deviation_pct ?? null,
    z_score: snapshot.z_score,
    regime_flag: snapshot.regime_flag,
    reference_rate: snapshot.reference_rate ?? null,
    reference_rate_source: snapshot.reference_rate_source ?? "unknown",
    liquidity_risk: liquidityRisk,
    timestamp: snapshot.timestamp,
    updated_at_iso: snapshot.updated_at_iso,
    age_seconds: ageSeconds,
    analytics_status: snapshot.analytics_status ?? "unknown",
    history_source: snapshot.history_source ?? "unknown",
    why_ltv_moved: explainLtv(snapshot),
  };
}
