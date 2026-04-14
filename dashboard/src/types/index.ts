import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface RiskState {
  lst_id: string;
  theta: number;
  sigma: number;
  regime_flag: number; // 0 = Normal, 1 = Critical
  suggested_ltv: number;
  z_score: number;
  spread: number;
  timestamp: number;
}

export interface OracleHistoryPoint {
  timestamp: number;
  spread_pct: number;
  msol_price: number;
  sol_price: number;
}

export interface OracleSnapshot extends RiskState {
  spread_pct: number;
  updated_at_iso?: string;
  status?: string;
  msol_price: number;
  sol_price: number;
  source?: string;
  bridge_timestamp?: string;
  history_points?: number;
  history_source?: string;
  step_seconds?: number;
  program_id?: string;
  risk_state_pda?: string;
  authority?: string;
  network?: string;
  history: OracleHistoryPoint[];
  baseline?: {
    theta_avg?: number;
    sigma_avg?: number;
    window_count?: number;
  };
}

export interface SimulationPoint {
  timestamp: string;
  spread_pct: number;
  theta: number;
  sigma: number;
  z_score: number;
  regime_flag: number;
  ltv_with_oracle: number;
  ltv_no_oracle: number;
  bad_debt_with_oracle: number;
  bad_debt_no_oracle: number;
}

export interface SimulationSnapshot {
  points: SimulationPoint[];
  summary: {
    row_count: number;
    max_spread_pct: number;
    max_z_score: number;
    critical_rows: number;
    final_dynamic_ltv: number;
    final_static_ltv: number;
  };
}

export interface MarketSnapshot {
  msol_price: number;
  sol_price: number;
  spread_pct: number;
  publish_time: number;
  source: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'alert' | 'success';
}
