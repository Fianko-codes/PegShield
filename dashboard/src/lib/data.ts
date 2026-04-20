import type { MarketSnapshot, OracleSnapshot, RiskState, SimulationSnapshot } from '../types';
import { DEFAULT_LST_ID } from './assets';

/**
 * LIVE-ONLY DATA FETCHING
 *
 * This module fetches data ONLY from live APIs - no static fallbacks.
 * If the API fails, null is returned and the UI shows an error state.
 */

export function getFallbackRiskState(lstId = DEFAULT_LST_ID): RiskState {
  // Return zeroed state - UI will show "waiting for data"
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

export async function fetchOracleSnapshot(lstId = DEFAULT_LST_ID): Promise<OracleSnapshot | null> {
  // ONLY fetch from live API - no static fallback
  try {
    const liveResponse = await fetch(`/api/oracle-state?lst_id=${encodeURIComponent(lstId)}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!liveResponse.ok) {
      console.error(`[fetchOracleSnapshot] API error: ${liveResponse.status} ${liveResponse.statusText}`);
      return null;
    }

    const liveData = await liveResponse.json();
    console.log('[fetchOracleSnapshot] Live API response:', {
      timestamp: liveData.timestamp,
      theta: liveData.theta,
      suggested_ltv: liveData.suggested_ltv,
      source: 'LIVE_API'
    });

    // Transform API response to OracleSnapshot format
    return {
      lst_id: liveData.lst_id ?? lstId,
      asset_symbol: liveData.asset_symbol,
      asset_display_name: liveData.asset_display_name,
      base_symbol: liveData.base_symbol ?? 'SOL',
      theta: liveData.theta ?? 0,
      sigma: liveData.sigma ?? 0,
      regime_flag: liveData.regime_flag ?? 0,
      suggested_ltv: liveData.suggested_ltv ?? 0,
      z_score: liveData.z_score ?? 0,
      spread: liveData.spread_pct ?? 0,
      spread_pct: liveData.spread_pct ?? 0,
      mu: liveData.mu,
      adf_pvalue: liveData.adf_pvalue,
      is_stationary: liveData.is_stationary,
      spread_signal: liveData.spread_signal,
      peg_deviation_pct: liveData.peg_deviation_pct,
      asset_price: liveData.asset_price ?? liveData.msol_price,
      reference_rate: liveData.reference_rate,
      reference_rate_source: liveData.reference_rate_source,
      data_timestamp: liveData.data_timestamp,
      timestamp: liveData.timestamp ?? 0,
      updated_at_iso: liveData.timestamp
        ? new Date(liveData.timestamp * 1000).toISOString()
        : undefined,
      status: liveData.status ?? 'UNKNOWN',
      msol_price: liveData.msol_price ?? 0,
      sol_price: liveData.sol_price ?? 0,
      source: 'LIVE_SOLANA_PDA',
      bridge_timestamp: liveData.bridge_timestamp,
      history_points: 0,
      history_source: 'none',
      step_seconds: 0,
      program_id: liveData.program_id,
      risk_state_pda: liveData.risk_state,
      authority: liveData.authority,
      last_updater: liveData.last_updater,
      network: liveData.network ?? 'solana-devnet',
      history: [],
      baseline: liveData.baseline,
    };
  } catch (error) {
    console.error('[fetchOracleSnapshot] Fetch error:', error);
    return null;
  }
}

export async function fetchSimulationSnapshot(): Promise<SimulationSnapshot | null> {
  try {
    const liveResponse = await fetch('/api/simulation', { cache: 'no-store' });
    if (liveResponse.ok) {
      return (await liveResponse.json()) as SimulationSnapshot;
    }
  } catch {
    // No fallback
  }

  // Load from static file only for simulation (this is expected behavior)
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
  // ONLY fetch from live Pyth API - no fallback
  try {
    const response = await fetch(`/api/market-state?lst_id=${encodeURIComponent(lstId)}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!response.ok) {
      console.error(`[fetchMarketSnapshot] API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log('[fetchMarketSnapshot] Live Pyth response:', {
      asset_price: data.asset_price,
      sol_price: data.sol_price,
      spread_pct: data.spread_pct,
      publish_time: data.publish_time,
      source: data.source
    });

    return data as MarketSnapshot;
  } catch (error) {
    console.error('[fetchMarketSnapshot] Fetch error:', error);
    return null;
  }
}
