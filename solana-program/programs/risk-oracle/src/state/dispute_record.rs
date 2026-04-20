use anchor_lang::prelude::*;

#[account]
pub struct DisputeRecord {
    /// The LST this dispute is for.
    pub lst_id: String,

    /// The slot when the disputed update was finalized.
    pub disputed_slot: u64,

    /// The canonical slot where the disputed round was written to RiskState.
    pub finalized_slot: u64,

    /// The attester who submitted the disputed update.
    pub disputed_attester: Pubkey,

    /// The person who filed the dispute.
    pub disputer: Pubkey,

    /// Hash of off-chain evidence (e.g., IPFS CID, Arweave tx).
    pub evidence_hash: [u8; 32],

    /// Timestamp when dispute was filed.
    pub filed_at: i64,

    /// Deadline for resolution (filed_at + 24 hours).
    pub resolution_deadline: i64,

    /// Whether this dispute has been resolved.
    pub is_resolved: bool,

    /// Outcome: true = attester slashed, false = dispute rejected.
    pub attester_slashed: bool,

    /// Amount slashed from attester (0 if not slashed).
    pub slash_amount: u64,

    /// Amount rewarded to disputer (0 if dispute rejected).
    pub disputer_reward: u64,

    /// The disputed risk parameters for the record.
    pub disputed_theta_scaled: i64,
    pub disputed_sigma_scaled: i64,
    pub disputed_regime_flag: u8,
    pub disputed_ltv_bps: u16,
    pub disputed_z_score_scaled: i64,
}

impl DisputeRecord {
    pub const SPACE: usize = 8   // Anchor discriminator
        + 4 + 16                  // lst_id String (max 16 bytes)
        + 8                       // disputed_slot u64
        + 8                       // finalized_slot u64
        + 32                      // disputed_attester Pubkey
        + 32                      // disputer Pubkey
        + 32                      // evidence_hash [u8; 32]
        + 8                       // filed_at i64
        + 8                       // resolution_deadline i64
        + 1                       // is_resolved bool
        + 1                       // attester_slashed bool
        + 8                       // slash_amount u64
        + 8                       // disputer_reward u64
        + 8                       // disputed_theta_scaled i64
        + 8                       // disputed_sigma_scaled i64
        + 1                       // disputed_regime_flag u8
        + 2                       // disputed_ltv_bps u16
        + 8;                      // disputed_z_score_scaled i64

    pub fn is_expired(&self, now: i64) -> bool {
        now > self.resolution_deadline
    }
}
