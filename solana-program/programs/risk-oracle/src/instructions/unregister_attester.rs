use anchor_lang::prelude::*;
use crate::state::AttesterRegistry;
use crate::errors::OracleError;
use crate::constants::*;

#[derive(Accounts)]
pub struct InitiateUnregister<'info> {
    #[account(
        mut,
        seeds = [ATTESTER_REGISTRY_SEED],
        bump
    )]
    pub registry: Account<'info, AttesterRegistry>,

    pub attester: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawBond<'info> {
    #[account(
        mut,
        seeds = [ATTESTER_REGISTRY_SEED],
        bump
    )]
    pub registry: Account<'info, AttesterRegistry>,

    #[account(mut)]
    pub attester: Signer<'info>,
}

pub fn initiate_handler(ctx: Context<InitiateUnregister>) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let attester_key = ctx.accounts.attester.key();
    let now = Clock::get()?.unix_timestamp;

    let slot_index = registry
        .find_attester(&attester_key)
        .ok_or(OracleError::NotRegistered)?;

    let entry = &mut registry.attesters[slot_index];

    // Check not already in cooldown
    require!(
        entry.unregister_initiated_at == 0,
        OracleError::CooldownActive
    );

    entry.unregister_initiated_at = now;

    msg!(
        "Attester {} initiated unregistration, can withdraw after {}",
        attester_key,
        now + UNREGISTER_COOLDOWN_SECS
    );

    Ok(())
}

pub fn withdraw_handler(ctx: Context<WithdrawBond>) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let attester_key = ctx.accounts.attester.key();
    let now = Clock::get()?.unix_timestamp;

    let slot_index = registry
        .find_attester(&attester_key)
        .ok_or(OracleError::NotRegistered)?;

    let entry = &registry.attesters[slot_index];

    // Check cooldown initiated
    require!(
        entry.unregister_initiated_at > 0,
        OracleError::NotInCooldown
    );

    // Check cooldown completed
    require!(
        now >= entry.unregister_initiated_at + UNREGISTER_COOLDOWN_SECS,
        OracleError::CooldownActive
    );

    // Prevent withdrawals that would make the registry unable to reach threshold.
    require!(
        registry.can_remove_attester(),
        OracleError::CannotDropBelowThreshold
    );

    let bond_amount = entry.bond;

    // Transfer bond back to attester
    let registry_info = ctx.accounts.registry.to_account_info();
    let attester_info = ctx.accounts.attester.to_account_info();

    **registry_info.try_borrow_mut_lamports()? -= bond_amount;
    **attester_info.try_borrow_mut_lamports()? += bond_amount;

    // Clear the slot
    let entry = &mut ctx.accounts.registry.attesters[slot_index];
    entry.is_active = false;
    entry.pubkey = Pubkey::default();
    entry.bond = 0;

    let registry = &mut ctx.accounts.registry;
    registry.attester_count -= 1;
    registry.total_bonded -= bond_amount;

    msg!(
        "Attester {} withdrew bond of {} lamports",
        attester_key,
        bond_amount
    );

    Ok(())
}
