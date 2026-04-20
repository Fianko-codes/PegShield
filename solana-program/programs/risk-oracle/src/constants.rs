pub const MAX_LST_ID_LEN: usize = 16;

/// Fixed-point scale factor. All float params are multiplied by this before
/// storing and divided by this after reading.
pub const SCALE: i64 = 1_000_000;

/// Minimum seconds between successive updates from the same authority.
pub const MIN_UPDATE_INTERVAL_SECS: i64 = 30;

/// Minimum suggested LTV in basis points (0%).
pub const MIN_LTV_BPS: u16 = 0;

/// Maximum suggested LTV in basis points (100%).
pub const MAX_LTV_BPS: u16 = 10_000;

/// Maximum number of attesters in the registry.
pub const MAX_ATTESTERS: usize = 5;

/// Minimum bond required to register as an attester (1 SOL).
pub const MIN_ATTESTER_BOND: u64 = 1_000_000_000;

/// Cooldown period before an attester can withdraw their bond (7 days).
pub const UNREGISTER_COOLDOWN_SECS: i64 = 7 * 24 * 60 * 60;

/// Time-to-live for pending updates before they expire (5 minutes).
pub const PENDING_UPDATE_TTL_SECS: i64 = 5 * 60;

/// Percentage of bond slashed on dispute resolution (50%).
pub const SLASH_PERCENT: u8 = 50;

/// Percentage of slashed amount that goes to disputer (50% of slashed = 25% of bond).
pub const DISPUTER_REWARD_PERCENT: u8 = 50;

/// Seed for AttesterRegistry PDA.
pub const ATTESTER_REGISTRY_SEED: &[u8] = b"attester_registry";

/// Seed for PendingUpdate PDA.
pub const PENDING_UPDATE_SEED: &[u8] = b"pending_update";
