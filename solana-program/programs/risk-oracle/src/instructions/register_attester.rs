use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::AttesterRegistry;
use crate::errors::OracleError;
use crate::constants::*;

#[derive(Accounts)]
pub struct RegisterAttester<'info> {
    #[account(
        mut,
        seeds = [ATTESTER_REGISTRY_SEED],
        bump
    )]
    pub registry: Account<'info, AttesterRegistry>,

    #[account(mut)]
    pub attester: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterAttester>, bond_amount: u64) -> Result<()> {
    let attester_key = ctx.accounts.attester.key();
    let now = Clock::get()?.unix_timestamp;

    // Check bond amount
    require!(
        bond_amount >= ctx.accounts.registry.min_bond,
        OracleError::InsufficientBond
    );

    // Check not already registered
    require!(
        ctx.accounts.registry.find_attester(&attester_key).is_none(),
        OracleError::AlreadyRegistered
    );

    // Find empty slot
    let slot_index = ctx.accounts.registry
        .find_empty_slot()
        .ok_or(OracleError::RegistryFull)?;

    // Transfer bond to registry PDA
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.attester.to_account_info(),
                to: ctx.accounts.registry.to_account_info(),
            },
        ),
        bond_amount,
    )?;

    // Register the attester
    let registry = &mut ctx.accounts.registry;
    let entry = &mut registry.attesters[slot_index];
    entry.pubkey = attester_key;
    entry.bond = bond_amount;
    entry.registered_at = now;
    entry.unregister_initiated_at = 0;
    entry.updates_submitted = 0;
    entry.disputes_lost = 0;
    entry.is_active = true;

    registry.attester_count += 1;
    registry.total_bonded += bond_amount;

    msg!(
        "Attester {} registered with bond {} lamports",
        attester_key,
        bond_amount
    );

    Ok(())
}
