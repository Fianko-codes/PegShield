import type { MarketSnapshot, OracleSnapshot, RiskState, SimulationSnapshot } from '../types';
import { DEFAULT_LST_ID } from './assets';

/**
 * Data fetching with live API as primary source, static snapshot for supplementary fields.
 *
 * On-chain PDA stores: theta, sigma, z_score, suggested_ltv, regime_flag, timestamp
 * Static snapshot adds: adf_pvalue, mu, peg_deviation_pct, history, baseline, etc.
 */

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

async function fetchStaticSnapshot(lstId: string): Promise<Partial<OracleSnapshot> | null> {
  try {
    const paths = [
      `/data/oracle_state.${lstId}.json`,
      '/data/oracle_state.json',
    ];
    for (const path of paths) {
      const response = await fetch(path, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data.lst_id === lstId || path === '/data/oracle_state.json') {
          return data;
        }
      }
    }
  } catch {
    // Static snapshot not available
  }
  return null;
}

export async function fetchOracleSnapshot(lstId = DEFAULT_LST_ID): Promise<OracleSnapshot | null> {
  // Fetch supplementary data from static snapshot (for fields not on-chain)
  const staticData = await fetchStaticSnapshot(lstId);

  // Primary source: Live on-chain PDA
  try {
    const liveResponse = await fetch(`/api/oracle-state?lst_id=${encodeURIComponent(lstId)}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!liveResponse.ok) {
      console.error(`[fetchOracleSnapshot] API error: ${liveResponse.status}`);
      return null;
    }

    const live = await liveResponse.json();
    console.log('[fetchOracleSnapshot] Live PDA data:', {
      timestamp: live.timestamp,
      theta: live.theta,
      source: 'LIVE_SOLANA_PDA'
    });

    // Merge: live on-chain data + supplementary static data
    return {
      // Core risk params from on-chain PDA
      lst_id: live.lst_id ?? lstId,
      theta: live.theta ?? 0,
      sigma: live.sigma ?? 0,
      regime_flag: live.regime_flag ?? 0,
      suggested_ltv: live.suggested_ltv ?? 0,
      z_score: live.z_score ?? 0,
      timestamp: live.timestamp ?? 0,

      // Supplementary fields from static snapshot (NOT on-chain)
      mu: staticData?.mu,
      adf_pvalue: staticData?.adf_pvalue,
      is_stationary: staticData?.is_stationary,
      peg_deviation_pct: staticData?.peg_deviation_pct,
      spread_signal: staticData?.spread_signal,
      history: staticData?.history ?? [],
      baseline: staticData?.baseline,

      // Asset metadata
      asset_symbol: staticData?.asset_symbol ?? live.asset_symbol,
      asset_display_name: staticData?.asset_display_name,
      base_symbol: staticData?.base_symbol ?? 'SOL',

      // Price data from static (market API is separate)
      asset_price: staticData?.asset_price ?? staticData?.msol_price,
      msol_price: staticData?.msol_price ?? 0,
      sol_price: staticData?.sol_price ?? 0,
      spread: staticData?.spread_pct ?? 0,
      spread_pct: staticData?.spread_pct ?? 0,
      reference_rate: staticData?.reference_rate,
      reference_rate_source: staticData?.reference_rate_source,

      // Timestamps
      data_timestamp: staticData?.data_timestamp ?? staticData?.timestamp,
      updated_at_iso: live.timestamp
        ? new Date(live.timestamp * 1000).toISOString()
        : staticData?.updated_at_iso,

      // Network info from live API
      status: live.regime_flag === 1 ? 'CRITICAL' : 'NORMAL',
      source: 'LIVE_SOLANA_PDA',
      bridge_timestamp: staticData?.bridge_timestamp,
      history_points: staticData?.history?.length ?? 0,
      history_source: staticData?.history_source ?? 'static_snapshot',
      step_seconds: staticData?.step_seconds ?? 0,
      program_id: live.program_id,
      risk_state_pda: live.risk_state,
      authority: live.authority,
      last_updater: live.last_updater,
      network: live.network ?? 'solana-devnet',
    };
  } catch (error) {
    console.error('[fetchOracleSnapshot] Fetch error:', error);
    return null;
  }
}

export async function fetchSimulationSnapshot(): Promise<SimulationSnapshot | null> {
  // Try API first
  try {
    const response = await fetch('/api/simulation', { cache: 'no-store' });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // API not available
  }

  // Fall back to static file
  try {
    const response = await fetch('/data/stress_scenario.json', { cache: 'no-store' });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Static file not available
  }

  return null;
}

export async function fetchMarketSnapshot(lstId = DEFAULT_LST_ID): Promise<MarketSnapshot | null> {
  try {
    const response = await fetch(`/api/market-state?lst_id=${encodeURIComponent(lstId)}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!response.ok) {
      console.error(`[fetchMarketSnapshot] API error: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[fetchMarketSnapshot] Fetch error:', error);
    return null;
  }
}
