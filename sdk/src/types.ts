/** 0 = NORMAL, 1 = CRITICAL (non-stationary spread + extreme z-score). */
export type RegimeFlag = 0 | 1;

/**
 * Decoded `RiskState` PDA.
 *
 * Human-readable floats (`theta`, `sigma`, `zScore`, `suggestedLtv`) are derived from the
 * on-chain scaled integers. The raw scaled fields are also exposed so consumers can
 * verify no precision was lost during conversion.
 */
export interface RiskState {
  /** LST ticker the PDA represents (e.g. "mSOL-v2"). */
  lstId: string;

  /** Mean-reversion speed θ (decoded from `thetaScaled / SCALE`). */
  theta: number;
  /** Volatility σ (decoded from `sigmaScaled / SCALE`). */
  sigma: number;
  /** Z-score of current spread vs. rolling window mean (decoded from `zScoreScaled / SCALE`). Signed. */
  zScore: number;
  /** Suggested LTV as a float in `[0, 1]` (decoded from `suggestedLtvBps / 10_000`). */
  suggestedLtv: number;

  /** Raw on-chain scaled integers (θ × SCALE). */
  thetaScaled: bigint;
  sigmaScaled: bigint;
  zScoreScaled: bigint;
  /** LTV in basis points, 0–10,000. */
  suggestedLtvBps: number;

  /** 0 NORMAL | 1 CRITICAL. In CRITICAL, consider gating new loans. */
  regimeFlag: RegimeFlag;

  /** Solana slot of the last update. */
  slot: bigint;
  /** Unix timestamp (seconds) of the last update. `0` until first update. */
  timestamp: bigint;

  /** Only pubkey allowed to call `update_risk_state`. */
  authority: string;
  /** Pubkey that submitted the most recent update. */
  lastUpdater: string;
  /** 0 = single-attester, 1 = multi-attester. */
  updateMode: number;
  /** Registry backing multi-attester mode. Default pubkey in single-attester mode. */
  attesterRegistry: string;
}
