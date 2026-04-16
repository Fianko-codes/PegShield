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
  asset_price?: number;
  msol_price: number;
  sol_price: number;
  peg_deviation?: number | null;
}

export interface OracleSnapshot extends RiskState {
  asset_symbol?: string;
  asset_display_name?: string;
  base_symbol?: string;
  spread_pct: number;
  mu?: number;
  adf_pvalue?: number;
  is_stationary?: boolean;
  spread_signal?: string;
  peg_deviation_pct?: number | null;
  asset_price?: number;
  reference_rate?: number | null;
  reference_rate_source?: string;
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
  last_updater?: string;
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
  peg_deviation?: number | null;
  theta: number;
  sigma: number;
  z_score: number;
  regime_flag: number;
  ltv_with_oracle: number;
  ltv_no_oracle: number;
  shortfall_dynamic: number;
  shortfall_static: number;
  bad_debt_with_oracle: number;
  bad_debt_no_oracle: number;
}

export interface SimulationReplaySource {
  label: string;
  url: string;
}

export interface SimulationReplay {
  id?: string;
  kind?: string;
  title?: string;
  description?: string;
  asset_symbol?: string;
  base_symbol?: string;
  reference_ratio?: number;
  event_window_label?: string;
  warmup_points?: number;
  scenario_points?: number;
  fixture_path?: string | null;
  sources?: SimulationReplaySource[];
}

export interface SimulationSnapshot {
  points: SimulationPoint[];
  replay?: SimulationReplay;
  summary: {
    row_count: number;
    max_spread_pct: number;
    min_spread_pct?: number;
    max_peg_deviation?: number;
    min_peg_deviation?: number;
    max_z_score: number;
    critical_rows: number;
    final_dynamic_ltv: number;
    final_static_ltv: number;
  };
}

export interface MarketSnapshot {
  asset_symbol?: string;
  base_symbol?: string;
  asset_price?: number;
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
