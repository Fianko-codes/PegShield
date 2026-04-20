use anchor_lang::prelude::*;
use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct LegacyRiskState {
    pub lst_id: String,
    pub theta_scaled: i64,
    pub sigma_scaled: i64,
    pub regime_flag: u8,
    pub suggested_ltv_bps: u16,
    pub z_score_scaled: i64,
    pub slot: u64,
    pub timestamp: i64,
    pub authority: Pubkey,
    pub last_updater: Pubkey,
}

#[account]
pub struct RiskState {
    /// ASCII ticker of the LST (e.g. "mSOL"), max 16 bytes.
    pub lst_id: String,

    /// Mean-reversion speed θ from the OU model, stored as θ × SCALE.
    pub theta_scaled: i64,

    /// Annualised volatility σ from the OU model, stored as σ × SCALE.
    pub sigma_scaled: i64,

    /// 0 = NORMAL | 1 = CRITICAL (spread non-stationary and extreme z-score).
    pub regime_flag: u8,

    /// Suggested loan-to-value ratio in basis points (8000 = 80%).
    pub suggested_ltv_bps: u16,

    /// Z-score of the current spread vs. the rolling window mean, stored as z × SCALE.
    pub z_score_scaled: i64,

    /// Slot at which the last update was written.
    pub slot: u64,

    /// Unix timestamp (seconds) of the last update. Zero before first update.
    pub timestamp: i64,

    /// The public key allowed to call update_risk_state (single-attester mode).
    pub authority: Pubkey,

    /// Public key of the wallet that submitted the most recent update.
    pub last_updater: Pubkey,

    /// Update mode: 0 = single-attester, 1 = multi-attester.
    pub update_mode: u8,

    /// Associated attester registry (only used in multi-attester mode).
    pub attester_registry: Pubkey,
}

impl RiskState {
    pub const LEGACY_SPACE: usize = 8  // Anchor discriminator
        + 4 + MAX_LST_ID_LEN    // String prefix (4) + data
        + 8                      // theta_scaled i64
        + 8                      // sigma_scaled i64
        + 1                      // regime_flag u8
        + 2                      // suggested_ltv_bps u16
        + 8                      // z_score_scaled i64
        + 8                      // slot u64
        + 8                      // timestamp i64
        + 32                     // authority Pubkey
        + 32;                    // last_updater Pubkey

    pub const SPACE: usize = 8  // Anchor discriminator
        + 4 + MAX_LST_ID_LEN    // String prefix (4) + data
        + 8                      // theta_scaled i64
        + 8                      // sigma_scaled i64
        + 1                      // regime_flag u8
        + 2                      // suggested_ltv_bps u16
        + 8                      // z_score_scaled i64
        + 8                      // slot u64
        + 8                      // timestamp i64
        + 32                     // authority Pubkey
        + 32                     // last_updater Pubkey
        + 1                      // update_mode u8
        + 32;                    // attester_registry Pubkey

    pub fn is_multi_attester(&self) -> bool {
        self.update_mode == 1
    }
}

impl LegacyRiskState {
    pub fn upgrade(self) -> RiskState {
        RiskState {
            lst_id: self.lst_id,
            theta_scaled: self.theta_scaled,
            sigma_scaled: self.sigma_scaled,
            regime_flag: self.regime_flag,
            suggested_ltv_bps: self.suggested_ltv_bps,
            z_score_scaled: self.z_score_scaled,
            slot: self.slot,
            timestamp: self.timestamp,
            authority: self.authority,
            last_updater: self.last_updater,
            update_mode: 0,
            attester_registry: Pubkey::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upgrades_legacy_state_with_safe_defaults() {
        let authority = Pubkey::new_unique();
        let last_updater = Pubkey::new_unique();

        let legacy = LegacyRiskState {
            lst_id: "mSOL-v2".to_string(),
            theta_scaled: 45_000,
            sigma_scaled: 12_000,
            regime_flag: 1,
            suggested_ltv_bps: 4_000,
            z_score_scaled: -1_230_000,
            slot: 42,
            timestamp: 1_700_000_000,
            authority,
            last_updater,
        };

        let upgraded = legacy.upgrade();

        assert_eq!(upgraded.lst_id, "mSOL-v2");
        assert_eq!(upgraded.theta_scaled, 45_000);
        assert_eq!(upgraded.sigma_scaled, 12_000);
        assert_eq!(upgraded.regime_flag, 1);
        assert_eq!(upgraded.suggested_ltv_bps, 4_000);
        assert_eq!(upgraded.z_score_scaled, -1_230_000);
        assert_eq!(upgraded.slot, 42);
        assert_eq!(upgraded.timestamp, 1_700_000_000);
        assert_eq!(upgraded.authority, authority);
        assert_eq!(upgraded.last_updater, last_updater);
        assert_eq!(upgraded.update_mode, 0);
        assert_eq!(upgraded.attester_registry, Pubkey::default());
    }
}
