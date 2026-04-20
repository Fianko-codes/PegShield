use anchor_lang::prelude::*;

use crate::constants::{DISPUTE_RECORD_SEED, RESOLUTION_DEADLINE_SECS};
use crate::errors::OracleError;
use crate::constants::ATTESTER_REGISTRY_SEED;
use crate::state::{AttesterRegistry, DisputeRecord, PendingUpdate};

#[derive(Accounts)]
#[instruction(lst_id: String, round_id: u64, disputed_attester: Pubkey)]
pub struct DisputeUpdate<'info> {
    #[account(mut)]
    pub disputer: Signer<'info>,

    #[account(
        seeds = [ATTESTER_REGISTRY_SEED],
        bump,
    )]
    pub registry: Account<'info, AttesterRegistry>,

    #[account(
        seeds = [crate::constants::PENDING_UPDATE_SEED, lst_id.as_bytes(), &round_id.to_le_bytes()],
        bump,
        constraint = pending_update.attester_registry == registry.key() @ OracleError::Unauthorized,
        constraint = pending_update.is_finalized @ OracleError::UpdateNotFinalized,
    )]
    pub pending_update: Account<'info, PendingUpdate>,

    #[account(
        init,
        payer = disputer,
        space = DisputeRecord::SPACE,
        seeds = [DISPUTE_RECORD_SEED, lst_id.as_bytes(), &round_id.to_le_bytes(), disputed_attester.as_ref()],
        bump,
    )]
    pub dispute_record: Account<'info, DisputeRecord>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<DisputeUpdate>,
    lst_id: String,
    _round_id: u64,
    disputed_attester: Pubkey,
    evidence_hash: [u8; 32],
) -> Result<()> {
    let registry = &ctx.accounts.registry;
    let pending_update = &ctx.accounts.pending_update;
    let dispute = &mut ctx.accounts.dispute_record;
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    require!(pending_update.dispute_window_open(now), OracleError::DisputeWindowClosed);

    let attester_index = registry
        .find_attester(&disputed_attester)
        .ok_or(OracleError::NotRegistered)?;
    require!(
        pending_update.has_attester_confirmed(attester_index as u8),
        OracleError::AttesterDidNotParticipate
    );

    // Initialize dispute record
    dispute.lst_id = lst_id;
    dispute.disputed_slot = pending_update.round_id;
    dispute.finalized_slot = pending_update.finalized_slot;
    dispute.disputed_attester = disputed_attester;
    dispute.disputer = ctx.accounts.disputer.key();
    dispute.evidence_hash = evidence_hash;
    dispute.filed_at = now;
    dispute.resolution_deadline = now + RESOLUTION_DEADLINE_SECS;
    dispute.is_resolved = false;
    dispute.attester_slashed = false;
    dispute.slash_amount = 0;
    dispute.disputer_reward = 0;

    // Store the disputed parameters for record
    dispute.disputed_theta_scaled = pending_update.params.theta_scaled;
    dispute.disputed_sigma_scaled = pending_update.params.sigma_scaled;
    dispute.disputed_regime_flag = pending_update.params.regime_flag;
    dispute.disputed_ltv_bps = pending_update.params.suggested_ltv_bps;
    dispute.disputed_z_score_scaled = pending_update.params.z_score_scaled;

    msg!(
        "Dispute filed against attester {} for round {}",
        dispute.disputed_attester,
        dispute.disputed_slot
    );

    Ok(())
}
