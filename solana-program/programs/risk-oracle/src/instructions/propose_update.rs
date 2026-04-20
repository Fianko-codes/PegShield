use anchor_lang::prelude::*;
use crate::state::{RiskState, AttesterRegistry, PendingUpdate, RiskParams};
use crate::errors::OracleError;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(lst_id: String, round_id: u64)]
pub struct ProposeUpdate<'info> {
    #[account(
        seeds = [b"risk", lst_id.as_bytes()],
        bump,
        constraint = risk_state.is_multi_attester() @ OracleError::SingleAttesterMode,
        constraint = risk_state.attester_registry == registry.key() @ OracleError::Unauthorized,
    )]
    pub risk_state: Account<'info, RiskState>,

    #[account(
        seeds = [ATTESTER_REGISTRY_SEED],
        bump
    )]
    pub registry: Account<'info, AttesterRegistry>,

    #[account(
        init,
        payer = proposer,
        space = PendingUpdate::SPACE,
        seeds = [PENDING_UPDATE_SEED, lst_id.as_bytes(), &round_id.to_le_bytes()],
        bump
    )]
    pub pending_update: Account<'info, PendingUpdate>,

    #[account(mut)]
    pub proposer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ProposeUpdate>,
    lst_id: String,
    round_id: u64,
    theta_scaled: i64,
    sigma_scaled: i64,
    regime_flag: u8,
    suggested_ltv_bps: u16,
    z_score_scaled: i64,
) -> Result<()> {
    let registry = &ctx.accounts.registry;
    let proposer_key = ctx.accounts.proposer.key();
    let now = Clock::get()?.unix_timestamp;
    let slot = Clock::get()?.slot;

    // Verify proposer is a registered attester
    let attester_index = registry
        .find_attester(&proposer_key)
        .ok_or(OracleError::NotRegistered)?;

    // Create the risk params
    let params = RiskParams {
        lst_id_hash: anchor_lang::solana_program::keccak::hash(lst_id.as_bytes()).0,
        theta_scaled,
        sigma_scaled,
        regime_flag,
        suggested_ltv_bps,
        z_score_scaled,
    };

    require!(params.is_valid(), OracleError::InvalidRiskParams);

    // Initialize the pending update
    let pending = &mut ctx.accounts.pending_update;
    pending.round_id = round_id;
    pending.lst_id = lst_id.clone();
    pending.attester_registry = registry.key();
    pending.proposer = proposer_key;
    pending.proposed_at = now;
    pending.proposed_slot = slot;
    pending.expires_at = now + PENDING_UPDATE_TTL_SECS;
    pending.confirmation_count = 1; // Proposer auto-confirms
    pending.confirmations_bitmap = 1 << attester_index;
    pending.is_finalized = false;
    pending.finalized_at = 0;
    pending.finalized_slot = 0;
    pending.params = params;

    msg!(
        "Update proposed by attester {} for LST {} round {}, expires at {}",
        proposer_key,
        lst_id,
        round_id,
        pending.expires_at
    );

    Ok(())
}
