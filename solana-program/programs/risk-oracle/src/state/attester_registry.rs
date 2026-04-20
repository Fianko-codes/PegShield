use anchor_lang::prelude::*;
use crate::constants::*;

#[account]
pub struct AttesterRegistry {
    /// Admin who can manage the registry.
    pub admin: Pubkey,

    /// Number of active attesters.
    pub attester_count: u8,

    /// Minimum confirmations required to finalize an update (e.g., 2 for 2-of-3).
    pub threshold: u8,

    /// Total SOL bonded across all attesters.
    pub total_bonded: u64,

    /// Minimum bond required to register.
    pub min_bond: u64,

    /// Destination for slashed funds (protocol treasury).
    pub slash_destination: Pubkey,

    /// Array of attester entries (fixed size for simpler account management).
    pub attesters: [AttesterEntry; MAX_ATTESTERS],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct AttesterEntry {
    /// Attester's public key (Pubkey::default() if slot is empty).
    pub pubkey: Pubkey,

    /// Amount of SOL bonded.
    pub bond: u64,

    /// Timestamp when attester registered.
    pub registered_at: i64,

    /// Timestamp when unregistration was initiated (0 if not initiated).
    pub unregister_initiated_at: i64,

    /// Number of successful updates submitted.
    pub updates_submitted: u64,

    /// Number of disputes lost (slashed).
    pub disputes_lost: u64,

    /// Whether this attester is active.
    pub is_active: bool,
}

impl AttesterRegistry {
    pub const SPACE: usize = 8   // Anchor discriminator
        + 32                      // admin Pubkey
        + 1                       // attester_count u8
        + 1                       // threshold u8
        + 8                       // total_bonded u64
        + 8                       // min_bond u64
        + 32                      // slash_destination Pubkey
        + (AttesterEntry::SPACE * MAX_ATTESTERS); // attesters array

    pub fn find_attester(&self, pubkey: &Pubkey) -> Option<usize> {
        self.attesters.iter().position(|a| a.is_active && a.pubkey == *pubkey)
    }

    pub fn find_empty_slot(&self) -> Option<usize> {
        self.attesters.iter().position(|a| !a.is_active)
    }

    pub fn active_attesters(&self) -> Vec<Pubkey> {
        self.attesters
            .iter()
            .filter(|a| a.is_active)
            .map(|a| a.pubkey)
            .collect()
    }

    pub fn can_remove_attester(&self) -> bool {
        self.attester_count > self.threshold
    }
}

impl AttesterEntry {
    pub const SPACE: usize = 32  // pubkey
        + 8                       // bond u64
        + 8                       // registered_at i64
        + 8                       // unregister_initiated_at i64
        + 8                       // updates_submitted u64
        + 8                       // disputes_lost u64
        + 1;                      // is_active bool
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_threshold_when_removing_attesters() {
        let mut registry = AttesterRegistry {
            admin: Pubkey::default(),
            attester_count: 3,
            threshold: 2,
            total_bonded: 0,
            min_bond: 0,
            slash_destination: Pubkey::default(),
            attesters: [AttesterEntry::default(); MAX_ATTESTERS],
        };

        assert!(registry.can_remove_attester());

        registry.attester_count = 2;
        assert!(!registry.can_remove_attester());
    }
}
