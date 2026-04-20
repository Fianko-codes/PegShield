use anchor_lang::prelude::*;
use crate::state::PendingUpdate;
use crate::errors::OracleError;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(lst_id: String)]
pub struct CancelExpired<'info> {
    #[account(
        mut,
        close = refund_recipient,
        seeds = [PENDING_UPDATE_SEED, lst_id.as_bytes()],
        bump,
    )]
    pub pending_update: Account<'info, PendingUpdate>,

    /// The original proposer gets the rent back.
    #[account(
        mut,
        constraint = refund_recipient.key() == pending_update.proposer @ OracleError::Unauthorized
    )]
    pub refund_recipient: SystemAccount<'info>,

    /// Anyone can call this to clean up expired updates.
    pub caller: Signer<'info>,
}

pub fn handler(ctx: Context<CancelExpired>, _lst_id: String) -> Result<()> {
    let pending = &ctx.accounts.pending_update;
    let now = Clock::get()?.unix_timestamp;

    // Must be expired
    require!(
        pending.is_expired(now),
        OracleError::PendingUpdateNotExpired
    );

    // Must not be finalized
    require!(
        !pending.is_finalized,
        OracleError::NoPendingUpdate
    );

    msg!(
        "Expired pending update for LST {} cancelled, rent refunded to {}",
        pending.lst_id,
        pending.proposer
    );

    Ok(())
}
