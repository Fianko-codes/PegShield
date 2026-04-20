use anchor_lang::prelude::*;

use crate::constants::{ATTESTER_REGISTRY_SEED, DISPUTE_RECORD_SEED, DISPUTER_REWARD_PERCENT, SLASH_PERCENT};
use crate::errors::OracleError;
use crate::state::{AttesterRegistry, DisputeRecord};

#[derive(Accounts)]
#[instruction(lst_id: String, disputed_slot: u64, disputed_attester: Pubkey)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [ATTESTER_REGISTRY_SEED],
        bump,
        has_one = admin @ OracleError::Unauthorized,
    )]
    pub registry: Account<'info, AttesterRegistry>,

    #[account(
        mut,
        seeds = [DISPUTE_RECORD_SEED, lst_id.as_bytes(), &disputed_slot.to_le_bytes(), disputed_attester.as_ref()],
        bump,
    )]
    pub dispute_record: Account<'info, DisputeRecord>,

    /// CHECK: The disputer who filed the dispute and may receive reward.
    #[account(mut)]
    pub disputer: UncheckedAccount<'info>,

    /// CHECK: Must match the slash destination configured in the registry.
    #[account(
        mut,
        constraint = slash_destination.key() == registry.slash_destination @ OracleError::Unauthorized,
    )]
    pub slash_destination: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ResolveDispute>,
    _lst_id: String,
    _disputed_slot: u64,
    _disputed_attester: Pubkey,
    slash_attester: bool,
) -> Result<()> {
    let dispute = &mut ctx.accounts.dispute_record;
    let registry = &mut ctx.accounts.registry;
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // Cannot resolve twice
    require!(!dispute.is_resolved, OracleError::DisputeAlreadyResolved);

    // Must resolve before deadline
    require!(
        now <= dispute.resolution_deadline,
        OracleError::DisputeDeadlinePassed
    );

    // Verify disputer account matches
    require_keys_eq!(
        ctx.accounts.disputer.key(),
        dispute.disputer,
        OracleError::Unauthorized
    );

    dispute.is_resolved = true;

    if slash_attester {
        // Find attester in registry
        let attester_key = dispute.disputed_attester;
        let attester_idx = registry
            .attesters
            .iter()
            .position(|a| a.pubkey == attester_key);

        if let Some(idx) = attester_idx {
            let attester = &mut registry.attesters[idx];
            require!(attester.is_active, OracleError::AttesterNotSlashable);

            // Calculate slash amount
            let slash_amount = (attester.bond as u128)
                .checked_mul(SLASH_PERCENT as u128)
                .unwrap()
                .checked_div(100)
                .unwrap() as u64;

            // Calculate disputer reward
            let disputer_reward = (slash_amount as u128)
                .checked_mul(DISPUTER_REWARD_PERCENT as u128)
                .unwrap()
                .checked_div(100)
                .unwrap() as u64;

            let protocol_reward = slash_amount
                .checked_sub(disputer_reward)
                .ok_or(OracleError::AttesterNotSlashable)?;

            // Deduct from attester bond
            attester.bond = attester
                .bond
                .checked_sub(slash_amount)
                .ok_or(OracleError::AttesterNotSlashable)?;

            // Update attester stats
            attester.disputes_lost = attester.disputes_lost.saturating_add(1);

            // Update registry total bonded
            registry.total_bonded = registry.total_bonded.saturating_sub(slash_amount);

            // Transfer reward to disputer from registry PDA
            let registry_info = ctx.accounts.registry.to_account_info();
            let disputer_info = ctx.accounts.disputer.to_account_info();
            let slash_destination_info = ctx.accounts.slash_destination.to_account_info();

            **registry_info.try_borrow_mut_lamports()? -= disputer_reward;
            **disputer_info.try_borrow_mut_lamports()? += disputer_reward;
            **registry_info.try_borrow_mut_lamports()? -= protocol_reward;
            **slash_destination_info.try_borrow_mut_lamports()? += protocol_reward;

            dispute.attester_slashed = true;
            dispute.slash_amount = slash_amount;
            dispute.disputer_reward = disputer_reward;

            msg!(
                "Attester {} slashed {} lamports, disputer rewarded {} lamports, protocol received {} lamports",
                attester_key,
                slash_amount,
                disputer_reward,
                protocol_reward
            );
        } else {
            return err!(OracleError::AttesterNotSlashable);
        }
    } else {
        msg!("Dispute rejected, no slash applied");
    }

    Ok(())
}
