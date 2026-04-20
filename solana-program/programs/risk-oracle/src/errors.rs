use anchor_lang::prelude::*;

#[error_code]
pub enum OracleError {
    #[msg("Unauthorized authority")]
    Unauthorized,

    #[msg("Invalid LST identifier")]
    InvalidLstId,

    #[msg("LST id does not match the initialized account")]
    LstIdMismatch,

    #[msg("Risk parameters contain invalid numeric values")]
    InvalidRiskParams,

    #[msg("Update submitted too frequently; wait at least 30 seconds")]
    UpdateTooFrequent,

    #[msg("Attester registry is full")]
    RegistryFull,

    #[msg("Attester is already registered")]
    AlreadyRegistered,

    #[msg("Attester is not registered")]
    NotRegistered,

    #[msg("Bond amount is below minimum required")]
    InsufficientBond,

    #[msg("Attester is in cooldown period, cannot withdraw yet")]
    CooldownActive,

    #[msg("Attester has not initiated unregistration")]
    NotInCooldown,

    #[msg("No pending update exists for this LST")]
    NoPendingUpdate,

    #[msg("Pending update has expired")]
    PendingUpdateExpired,

    #[msg("Attester has already confirmed this update")]
    AlreadyConfirmed,

    #[msg("Threshold not yet reached for finalization")]
    ThresholdNotReached,

    #[msg("Pending update has not expired yet")]
    PendingUpdateNotExpired,

    #[msg("Withdrawal would drop the registry below its required threshold")]
    CannotDropBelowThreshold,

    #[msg("Invalid threshold configuration")]
    InvalidThreshold,

    #[msg("Cannot dispute an update from more than 1 hour ago")]
    DisputeWindowClosed,

    #[msg("Dispute has already been resolved")]
    DisputeAlreadyResolved,

    #[msg("Dispute resolution deadline has passed")]
    DisputeDeadlinePassed,

    #[msg("Attester has insufficient bond for slashing")]
    AttesterNotSlashable,

    #[msg("Dispute resolution deadline has not passed yet")]
    DisputeNotExpired,

    #[msg("The referenced update has not been finalized yet")]
    UpdateNotFinalized,

    #[msg("The disputed attester did not participate in this round")]
    AttesterDidNotParticipate,

    #[msg("Oracle is in multi-attester mode, use propose_update instead")]
    MultiAttesterModeActive,

    #[msg("Oracle is in single-attester mode")]
    SingleAttesterMode,

    #[msg("RiskState account could not be decoded for migration")]
    InvalidRiskStateAccount,
}
