/** Matches `SCALE` in the Anchor program. All i64 risk fields are stored × SCALE. */
export const SCALE = 1_000_000;

/** LTV basis-point clamps enforced on-chain. */
export const MIN_LTV_BPS = 0;
export const MAX_LTV_BPS = 10_000;

/** PDA seed prefix: `[b"risk", lst_id]`. */
export const RISK_STATE_SEED = "risk";

/** Recommended consumer staleness threshold. PDA older than this should NOT be trusted. */
export const MAX_STALENESS_SECS = 600;

/** Deployed devnet program. Pass an override to `deriveRiskStatePda` / `fetchRiskState` for other clusters. */
export const DEFAULT_PROGRAM_ID = "DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea";

/** Canonical LST identifier on devnet (new layout, migrated from the legacy f64 PDA). */
export const DEFAULT_LST_ID = "mSOL-v2";

/** Minimum seconds between `update_risk_state` calls enforced on-chain. */
export const MIN_UPDATE_INTERVAL_SECS = 30;
