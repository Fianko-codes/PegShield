use anchor_lang::prelude::*;
use crate::state::{AttesterRegistry, AttesterEntry};
use crate::errors::OracleError;
use crate::constants::*;

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = admin,
        space = AttesterRegistry::SPACE,
        seeds = [ATTESTER_REGISTRY_SEED],
        bump
    )]
    pub registry: Account<'info, AttesterRegistry>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// Where slashed funds will go.
    /// CHECK: This is just a destination pubkey, no validation needed.
    pub slash_destination: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeRegistry>,
    threshold: u8,
    min_bond: u64,
) -> Result<()> {
    require!(
        threshold > 0 && threshold <= MAX_ATTESTERS as u8,
        OracleError::InvalidThreshold
    );
    require!(
        min_bond >= MIN_ATTESTER_BOND,
        OracleError::InsufficientBond
    );

    let registry = &mut ctx.accounts.registry;
    registry.admin = ctx.accounts.admin.key();
    registry.attester_count = 0;
    registry.threshold = threshold;
    registry.total_bonded = 0;
    registry.min_bond = min_bond;
    registry.slash_destination = ctx.accounts.slash_destination.key();
    registry.attesters = [AttesterEntry::default(); MAX_ATTESTERS];

    Ok(())
}
