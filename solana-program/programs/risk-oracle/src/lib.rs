#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;
pub mod instructions;

use instructions::*;

declare_id!("DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea");

#[program]
pub mod risk_oracle {
    use super::*;

    /// Initialize a new risk state PDA for an LST (single-attester mode).
    pub fn initialize_oracle(
        ctx: Context<InitializeOracle>,
        lst_id: String,
        authority: Pubkey,
    ) -> Result<()> {
        instructions::initialize_oracle::handler(ctx, lst_id, authority)
    }

    /// Update risk state (single-attester mode only).
    pub fn update_risk_state(
        ctx: Context<UpdateRiskState>,
        params: UpdateRiskParams,
    ) -> Result<()> {
        instructions::update_risk_state::handler(ctx, params)
    }

    /// Close a risk state PDA and refund rent.
    pub fn close_oracle(ctx: Context<CloseOracle>) -> Result<()> {
        instructions::close_oracle::handler(ctx)
    }

    /// Initialize the attester registry (admin only).
    pub fn initialize_registry(
        ctx: Context<InitializeRegistry>,
        threshold: u8,
        min_bond: u64,
    ) -> Result<()> {
        instructions::initialize_registry::handler(ctx, threshold, min_bond)
    }

    /// Register as an attester by staking a bond.
    pub fn register_attester(
        ctx: Context<RegisterAttester>,
        bond_amount: u64,
    ) -> Result<()> {
        instructions::register_attester::handler(ctx, bond_amount)
    }

    /// Initiate unregistration (starts cooldown period).
    pub fn initiate_unregister(ctx: Context<InitiateUnregister>) -> Result<()> {
        instructions::unregister_attester::initiate_handler(ctx)
    }

    /// Withdraw bond after cooldown period.
    pub fn withdraw_bond(ctx: Context<WithdrawBond>) -> Result<()> {
        instructions::unregister_attester::withdraw_handler(ctx)
    }

    /// Enable multi-attester mode for an existing oracle.
    pub fn enable_multi_attester(
        ctx: Context<EnableMultiAttester>,
        lst_id: String,
    ) -> Result<()> {
        instructions::enable_multi_attester::handler(ctx, lst_id)
    }

    /// Propose a risk update (multi-attester mode).
    pub fn propose_update(
        ctx: Context<ProposeUpdate>,
        lst_id: String,
        round_id: u64,
        theta_scaled: i64,
        sigma_scaled: i64,
        regime_flag: u8,
        suggested_ltv_bps: u16,
        z_score_scaled: i64,
    ) -> Result<()> {
        instructions::propose_update::handler(
            ctx,
            lst_id,
            round_id,
            theta_scaled,
            sigma_scaled,
            regime_flag,
            suggested_ltv_bps,
            z_score_scaled,
        )
    }

    /// Confirm a pending update (multi-attester mode).
    pub fn confirm_update(ctx: Context<ConfirmUpdate>, lst_id: String, round_id: u64) -> Result<()> {
        instructions::confirm_update::handler(ctx, lst_id, round_id)
    }

    /// Cancel an expired pending update.
    pub fn cancel_expired(ctx: Context<CancelExpired>, lst_id: String, round_id: u64) -> Result<()> {
        instructions::cancel_expired::handler(ctx, lst_id, round_id)
    }

    /// Migrate a legacy RiskState account to the current layout.
    pub fn migrate_risk_state(
        ctx: Context<MigrateRiskState>,
        lst_id: String,
    ) -> Result<()> {
        instructions::migrate_risk_state::handler(ctx, lst_id)
    }

    /// File a dispute against a recent risk update.
    pub fn dispute_update(
        ctx: Context<DisputeUpdate>,
        lst_id: String,
        round_id: u64,
        disputed_attester: Pubkey,
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        instructions::dispute_update::handler(ctx, lst_id, round_id, disputed_attester, evidence_hash)
    }

    /// Resolve a dispute (admin only). Slashes attester if slash_attester is true.
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        lst_id: String,
        disputed_slot: u64,
        disputed_attester: Pubkey,
        slash_attester: bool,
    ) -> Result<()> {
        instructions::resolve_dispute::handler(ctx, lst_id, disputed_slot, disputed_attester, slash_attester)
    }

    /// Close an expired, unresolved dispute and refund rent to disputer.
    pub fn close_expired_dispute(
        ctx: Context<CloseExpiredDispute>,
        lst_id: String,
        disputed_slot: u64,
        disputed_attester: Pubkey,
    ) -> Result<()> {
        instructions::close_expired_dispute::handler(ctx, lst_id, disputed_slot, disputed_attester)
    }
}
