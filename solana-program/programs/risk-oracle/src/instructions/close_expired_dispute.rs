use anchor_lang::prelude::*;

use crate::constants::DISPUTE_RECORD_SEED;
use crate::errors::OracleError;
use crate::state::DisputeRecord;

#[derive(Accounts)]
#[instruction(lst_id: String, disputed_slot: u64, disputed_attester: Pubkey)]
pub struct CloseExpiredDispute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [DISPUTE_RECORD_SEED, lst_id.as_bytes(), &disputed_slot.to_le_bytes(), disputed_attester.as_ref()],
        bump,
        close = disputer,
    )]
    pub dispute_record: Account<'info, DisputeRecord>,

    /// CHECK: The original disputer who receives rent refund.
    #[account(
        mut,
        constraint = disputer.key() == dispute_record.disputer @ OracleError::Unauthorized
    )]
    pub disputer: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CloseExpiredDispute>,
    _lst_id: String,
    _disputed_slot: u64,
    _disputed_attester: Pubkey,
) -> Result<()> {
    let dispute = &ctx.accounts.dispute_record;
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // Can only close if expired AND unresolved
    require!(dispute.is_expired(now), OracleError::DisputeNotExpired);
    require!(!dispute.is_resolved, OracleError::DisputeAlreadyResolved);

    msg!(
        "Closing expired dispute for slot {}, rent refunded to disputer",
        dispute.disputed_slot
    );

    Ok(())
}
