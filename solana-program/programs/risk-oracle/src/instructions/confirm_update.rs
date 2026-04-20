use anchor_lang::prelude::*;
use crate::state::{RiskState, AttesterRegistry, PendingUpdate};
use crate::errors::OracleError;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(lst_id: String)]
pub struct ConfirmUpdate<'info> {
    #[account(
        mut,
        seeds = [b"risk", lst_id.as_bytes()],
        bump,
        constraint = risk_state.is_multi_attester() @ OracleError::SingleAttesterMode,
    )]
    pub risk_state: Account<'info, RiskState>,

    #[account(
        mut,
        seeds = [ATTESTER_REGISTRY_SEED],
        bump
    )]
    pub registry: Account<'info, AttesterRegistry>,

    #[account(
        mut,
        seeds = [PENDING_UPDATE_SEED, lst_id.as_bytes()],
        bump,
        constraint = !pending_update.is_finalized @ OracleError::NoPendingUpdate,
    )]
    pub pending_update: Account<'info, PendingUpdate>,

    pub confirmer: Signer<'info>,
}

pub fn handler(ctx: Context<ConfirmUpdate>, lst_id: String) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let pending = &mut ctx.accounts.pending_update;
    let confirmer_key = ctx.accounts.confirmer.key();
    let now = Clock::get()?.unix_timestamp;

    // Check not expired
    require!(!pending.is_expired(now), OracleError::PendingUpdateExpired);

    // Verify confirmer is a registered attester
    let attester_index = registry
        .find_attester(&confirmer_key)
        .ok_or(OracleError::NotRegistered)?;

    // Check not already confirmed
    require!(
        !pending.has_attester_confirmed(attester_index as u8),
        OracleError::AlreadyConfirmed
    );

    // Add confirmation
    pending.add_confirmation(attester_index as u8);

    msg!(
        "Update confirmed by attester {} ({}/{})",
        confirmer_key,
        pending.confirmation_count,
        registry.threshold
    );

    // Check if threshold reached
    if pending.confirmation_count >= registry.threshold {
        // Finalize the update
        let state = &mut ctx.accounts.risk_state;
        let params = &pending.params;

        state.theta_scaled = params.theta_scaled;
        state.sigma_scaled = params.sigma_scaled;
        state.regime_flag = params.regime_flag;
        state.suggested_ltv_bps = params.suggested_ltv_bps;
        state.z_score_scaled = params.z_score_scaled;
        state.slot = Clock::get()?.slot;
        state.timestamp = now;
        state.last_updater = confirmer_key;

        pending.is_finalized = true;

        // Increment updates_submitted for proposer
        if let Some(proposer_idx) = registry.find_attester(&pending.proposer) {
            registry.attesters[proposer_idx].updates_submitted += 1;
        }

        msg!(
            "Update finalized for LST {} at slot {}",
            lst_id,
            state.slot
        );
    }

    Ok(())
}
