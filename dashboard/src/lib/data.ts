import type { MarketSnapshot, OracleSnapshot, RiskState, SimulationSnapshot } from '../types';
import { DEFAULT_LST_ID } from './assets';

export function getFallbackRiskState(lstId = DEFAULT_LST_ID): RiskState {
  return {
    lst_id: lstId,
    theta: 0,
    sigma: 0,
    regime_flag: 0,
    suggested_ltv: 0,
    z_score: 0,
    spread: 0,
    timestamp: 0,
  };
}

function normalizeOracleSnapshot(
  liveSnapshot: Partial<OracleSnapshot> | null,
  staticSnapshot: OracleSnapshot | null,
): OracleSnapshot | null {
  if (!liveSnapshot && !staticSnapshot) {
    return null;
  }

  const liveRiskState = (liveSnapshot as { risk_state?: string } | null)?.risk_state;

  const merged = {
    ...(staticSnapshot ?? {}),
    ...(liveSnapshot ?? {}),
  } as Partial<OracleSnapshot>;

  const history = Array.isArray(merged.history) ? merged.history : staticSnapshot?.history ?? [];
  const spreadPct =
    typeof merged.spread_pct === 'number'
      ? merged.spread_pct
      : typeof merged.spread === 'number'
        ? merged.spread
        : history[history.length - 1]?.spread_pct ?? 0;

  return {
    lst_id: merged.lst_id ?? staticSnapshot?.lst_id ?? 'mSOL-v2',
    asset_symbol: merged.asset_symbol ?? staticSnapshot?.asset_symbol,
    asset_display_name: merged.asset_display_name ?? staticSnapshot?.asset_display_name,
    base_symbol: merged.base_symbol ?? staticSnapshot?.base_symbol ?? 'SOL',
    theta: merged.theta ?? staticSnapshot?.theta ?? 0,
    sigma: merged.sigma ?? staticSnapshot?.sigma ?? 0,
    regime_flag: merged.regime_flag ?? staticSnapshot?.regime_flag ?? 0,
    suggested_ltv: merged.suggested_ltv ?? staticSnapshot?.suggested_ltv ?? 0,
    z_score: merged.z_score ?? staticSnapshot?.z_score ?? 0,
    spread: spreadPct,
    spread_pct: spreadPct,
    mu: merged.mu ?? staticSnapshot?.mu,
    adf_pvalue: merged.adf_pvalue ?? staticSnapshot?.adf_pvalue,
    is_stationary: merged.is_stationary ?? staticSnapshot?.is_stationary,
    spread_signal: merged.spread_signal ?? staticSnapshot?.spread_signal,
    peg_deviation_pct: merged.peg_deviation_pct ?? staticSnapshot?.peg_deviation_pct,
    asset_price: merged.asset_price ?? staticSnapshot?.asset_price ?? merged.msol_price ?? staticSnapshot?.msol_price,
    reference_rate: merged.reference_rate ?? staticSnapshot?.reference_rate,
    reference_rate_source: merged.reference_rate_source ?? staticSnapshot?.reference_rate_source,
    timestamp: merged.timestamp ?? staticSnapshot?.timestamp ?? 0,
    updated_at_iso:
      merged.updated_at_iso ??
      staticSnapshot?.updated_at_iso ??
      (merged.timestamp
        ? new Date(merged.timestamp * 1000).toISOString()
        : undefined),
    status: merged.status ?? staticSnapshot?.status ?? 'UNKNOWN',
    msol_price: merged.msol_price ?? staticSnapshot?.msol_price ?? 0,
    sol_price: merged.sol_price ?? staticSnapshot?.sol_price ?? 0,
    source: merged.source ?? staticSnapshot?.source ?? 'unknown',
    bridge_timestamp: merged.bridge_timestamp ?? staticSnapshot?.bridge_timestamp,
    history_points: merged.history_points ?? staticSnapshot?.history_points ?? history.length,
    history_source: merged.history_source ?? staticSnapshot?.history_source ?? 'unknown',
    step_seconds: merged.step_seconds ?? staticSnapshot?.step_seconds ?? 0,
    program_id: merged.program_id ?? staticSnapshot?.program_id,
    risk_state_pda: liveRiskState ?? merged.risk_state_pda ?? staticSnapshot?.risk_state_pda,
    authority: merged.authority ?? staticSnapshot?.authority,
    last_updater: merged.last_updater ?? staticSnapshot?.last_updater,
    network: merged.network ?? staticSnapshot?.network ?? 'solana-devnet',
    history,
    baseline: merged.baseline ?? staticSnapshot?.baseline,
  };
}

async function fetchStaticOracleSnapshot(lstId: string): Promise<OracleSnapshot | null> {
  try {
    const candidatePaths = [
      `/data/oracle_state.${lstId}.json`,
      '/data/oracle_state.json',
    ];

    for (const candidate of candidatePaths) {
      const response = await fetch(candidate, { cache: 'no-store' });
      if (!response.ok) {
        continue;
      }
      const snapshot = (await response.json()) as OracleSnapshot;
      if (snapshot.lst_id === lstId) {
        return snapshot;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchOracleSnapshot(lstId = DEFAULT_LST_ID): Promise<OracleSnapshot | null> {
  const staticSnapshot = await fetchStaticOracleSnapshot(lstId);

  try {
    const liveResponse = await fetch(`/api/oracle-state?lst_id=${encodeURIComponent(lstId)}`, { cache: 'no-store' });
    if (liveResponse.ok) {
      const liveSnapshot = (await liveResponse.json()) as Partial<OracleSnapshot>;
      return normalizeOracleSnapshot(liveSnapshot, staticSnapshot);
    }
  } catch {
    // Fall through to the static snapshot.
  }

  return normalizeOracleSnapshot(null, staticSnapshot);
}

export async function fetchSimulationSnapshot(): Promise<SimulationSnapshot | null> {
  try {
    const liveResponse = await fetch('/api/simulation', { cache: 'no-store' });
    if (liveResponse.ok) {
      return (await liveResponse.json()) as SimulationSnapshot;
    }
  } catch {
    // Fall through to the static snapshot.
  }

  try {
    const response = await fetch('/data/stress_scenario.json', { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as SimulationSnapshot;
  } catch {
    return null;
  }
}

export async function fetchMarketSnapshot(lstId = DEFAULT_LST_ID): Promise<MarketSnapshot | null> {
  try {
    const response = await fetch(`/api/market-state?lst_id=${encodeURIComponent(lstId)}`, { cache: 'no-store' });
    if (!response.ok) {
      const staticSnapshot = await fetchStaticOracleSnapshot(lstId);
      if (!staticSnapshot) {
        return null;
      }
      return {
        lst_id: staticSnapshot.lst_id,
        asset_symbol: staticSnapshot.asset_symbol,
        base_symbol: staticSnapshot.base_symbol,
        asset_price: staticSnapshot.asset_price ?? staticSnapshot.msol_price,
        msol_price: staticSnapshot.msol_price,
        sol_price: staticSnapshot.sol_price,
        spread_pct: staticSnapshot.spread_pct,
        publish_time: staticSnapshot.timestamp,
        source: 'snapshot-fallback',
      };
    }
    return (await response.json()) as MarketSnapshot;
  } catch {
    const staticSnapshot = await fetchStaticOracleSnapshot(lstId);
    if (!staticSnapshot) {
      return null;
    }
    return {
      lst_id: staticSnapshot.lst_id,
      asset_symbol: staticSnapshot.asset_symbol,
      base_symbol: staticSnapshot.base_symbol,
      asset_price: staticSnapshot.asset_price ?? staticSnapshot.msol_price,
      msol_price: staticSnapshot.msol_price,
      sol_price: staticSnapshot.sol_price,
      spread_pct: staticSnapshot.spread_pct,
      publish_time: staticSnapshot.timestamp,
      source: 'snapshot-fallback',
    };
  }
}
