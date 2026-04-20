use anchor_lang::prelude::*;
use crate::state::{RiskState, AttesterRegistry};
use crate::errors::OracleError;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(lst_id: String)]
pub struct EnableMultiAttester<'info> {
    #[account(
        mut,
        seeds = [b"risk", lst_id.as_bytes()],
        bump,
        has_one = authority @ OracleError::Unauthorized,
        constraint = !risk_state.is_multi_attester() @ OracleError::MultiAttesterModeActive,
    )]
    pub risk_state: Account<'info, RiskState>,

    #[account(
        seeds = [ATTESTER_REGISTRY_SEED],
        bump,
        constraint = registry.attester_count >= registry.threshold @ OracleError::ThresholdNotReached,
    )]
    pub registry: Account<'info, AttesterRegistry>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<EnableMultiAttester>, _lst_id: String) -> Result<()> {
    let state = &mut ctx.accounts.risk_state;
    let registry = &ctx.accounts.registry;

    state.update_mode = 1;
    state.attester_registry = registry.key();

    msg!(
        "Multi-attester mode enabled for LST {}, registry: {}, threshold: {}/{}",
        state.lst_id,
        registry.key(),
        registry.threshold,
        registry.attester_count
    );

    Ok(())
}
