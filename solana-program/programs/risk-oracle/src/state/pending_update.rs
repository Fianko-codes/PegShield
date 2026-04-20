use anchor_lang::prelude::*;
use crate::constants::*;

#[account]
pub struct PendingUpdate {
    /// The LST this update is for.
    pub lst_id: String,

    /// The attester who proposed this update.
    pub proposer: Pubkey,

    /// Timestamp when the update was proposed.
    pub proposed_at: i64,

    /// Slot when the update was proposed.
    pub proposed_slot: u64,

    /// Timestamp when the update expires.
    pub expires_at: i64,

    /// Number of confirmations received.
    pub confirmation_count: u8,

    /// Bitmap of which attesters have confirmed (by index in registry).
    pub confirmations_bitmap: u8,

    /// Whether this update has been finalized.
    pub is_finalized: bool,

    /// Proposed risk parameters.
    pub params: RiskParams,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct RiskParams {
    /// LST identifier (must match the PendingUpdate's lst_id).
    pub lst_id_hash: [u8; 32],

    /// θ × SCALE (non-negative).
    pub theta_scaled: i64,

    /// σ × SCALE (positive).
    pub sigma_scaled: i64,

    /// 0 = NORMAL, 1 = CRITICAL.
    pub regime_flag: u8,

    /// LTV in basis points, 0–10,000.
    pub suggested_ltv_bps: u16,

    /// z × SCALE (signed).
    pub z_score_scaled: i64,
}

impl PendingUpdate {
    pub const SPACE: usize = 8   // Anchor discriminator
        + 4 + MAX_LST_ID_LEN      // lst_id String
        + 32                      // proposer Pubkey
        + 8                       // proposed_at i64
        + 8                       // proposed_slot u64
        + 8                       // expires_at i64
        + 1                       // confirmation_count u8
        + 1                       // confirmations_bitmap u8
        + 1                       // is_finalized bool
        + RiskParams::SPACE;      // params

    pub fn is_expired(&self, now: i64) -> bool {
        now >= self.expires_at
    }

    pub fn has_attester_confirmed(&self, attester_index: u8) -> bool {
        (self.confirmations_bitmap & (1 << attester_index)) != 0
    }

    pub fn add_confirmation(&mut self, attester_index: u8) {
        self.confirmations_bitmap |= 1 << attester_index;
        self.confirmation_count += 1;
    }
}

impl RiskParams {
    pub const SPACE: usize = 32  // lst_id_hash
        + 8                       // theta_scaled i64
        + 8                       // sigma_scaled i64
        + 1                       // regime_flag u8
        + 2                       // suggested_ltv_bps u16
        + 8;                      // z_score_scaled i64

    pub fn is_valid(&self) -> bool {
        self.theta_scaled >= 0
            && self.sigma_scaled > 0
            && self.suggested_ltv_bps <= MAX_LTV_BPS
    }
}
