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
        theta_scaled: i64,
        sigma_scaled: i64,
        regime_flag: u8,
        suggested_ltv_bps: u16,
        z_score_scaled: i64,
    ) -> Result<()> {
        instructions::propose_update::handler(
            ctx,
            lst_id,
            theta_scaled,
            sigma_scaled,
            regime_flag,
            suggested_ltv_bps,
            z_score_scaled,
        )
    }

    /// Confirm a pending update (multi-attester mode).
    pub fn confirm_update(ctx: Context<ConfirmUpdate>, lst_id: String) -> Result<()> {
        instructions::confirm_update::handler(ctx, lst_id)
    }

    /// Cancel an expired pending update.
    pub fn cancel_expired(ctx: Context<CancelExpired>, lst_id: String) -> Result<()> {
        instructions::cancel_expired::handler(ctx, lst_id)
    }
}
