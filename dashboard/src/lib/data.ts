import type { OracleSnapshot, RiskState, SimulationSnapshot } from '../types';

const fallbackRiskState: RiskState = {
  lst_id: 'mSOL',
  theta: 0,
  sigma: 0,
  regime_flag: 0,
  suggested_ltv: 0,
  z_score: 0,
  spread: 0,
  timestamp: 0,
};

export function getFallbackRiskState(): RiskState {
  return fallbackRiskState;
}

export async function fetchOracleSnapshot(): Promise<OracleSnapshot | null> {
  try {
    const liveResponse = await fetch('/api/oracle-state', { cache: 'no-store' });
    if (liveResponse.ok) {
      return (await liveResponse.json()) as OracleSnapshot;
    }
  } catch {
    // Fall through to the static snapshot.
  }

  try {
    const response = await fetch('/data/oracle_state.json', { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as OracleSnapshot;
  } catch {
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
