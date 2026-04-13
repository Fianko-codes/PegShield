#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const MAX_LST_ID_LEN: usize = 16;
const MIN_LTV: f64 = 0.0;
const MAX_LTV: f64 = 1.0;

#[program]
pub mod risk_oracle {
    use super::*;

    pub fn initialize_oracle(
        ctx: Context<InitializeOracle>,
        lst_id: String,
        authority: Pubkey,
    ) -> Result<()> {
        require!(valid_lst_id(&lst_id), OracleError::InvalidLstId);

        let state = &mut ctx.accounts.risk_state;
        state.lst_id = lst_id;
        state.theta = 0.0;
        state.sigma = 0.0;
        state.regime_flag = 0;
        state.suggested_ltv = 0.0;
        state.z_score = 0.0;
        state.slot = Clock::get()?.slot;
        state.timestamp = Clock::get()?.unix_timestamp;
        state.authority = authority;
        state.last_updater = authority;
        Ok(())
    }

    pub fn update_risk_state(
        ctx: Context<UpdateRiskState>,
        params: RiskParams,
    ) -> Result<()> {
        require!(valid_lst_id(&params.lst_id), OracleError::InvalidLstId);
        require!(valid_risk_params(&params), OracleError::InvalidRiskParams);

        let state = &mut ctx.accounts.risk_state;
        require_keys_eq!(
            ctx.accounts.authority.key(),
            state.authority,
            OracleError::Unauthorized
        );
        require!(state.lst_id == params.lst_id, OracleError::LstIdMismatch);

        state.theta = params.theta;
        state.sigma = params.sigma;
        state.regime_flag = params.regime_flag;
        state.suggested_ltv = params.suggested_ltv;
        state.z_score = params.z_score;
        state.slot = Clock::get()?.slot;
        state.timestamp = Clock::get()?.unix_timestamp;
        state.last_updater = ctx.accounts.authority.key();
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(lst_id: String)]
pub struct InitializeOracle<'info> {
    #[account(
        init,
        payer = payer,
        space = RiskState::SPACE,
        seeds = [b"risk", lst_id.as_bytes()],
        bump
    )]
    pub risk_state: Account<'info, RiskState>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: RiskParams)]
pub struct UpdateRiskState<'info> {
    #[account(
        mut,
        seeds = [b"risk", params.lst_id.as_bytes()],
        bump
    )]
    pub risk_state: Account<'info, RiskState>,

    pub authority: Signer<'info>,
}

#[account]
pub struct RiskState {
    pub lst_id: String,
    pub theta: f64,
    pub sigma: f64,
    pub regime_flag: u8,
    pub suggested_ltv: f64,
    pub z_score: f64,
    pub slot: u64,
    pub timestamp: i64,
    pub authority: Pubkey,
    pub last_updater: Pubkey,
}

impl RiskState {
    pub const SPACE: usize = 8
        + 4 + MAX_LST_ID_LEN
        + 8
        + 8
        + 1
        + 8
        + 8
        + 8
        + 8
        + 32
        + 32;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RiskParams {
    pub lst_id: String,
    pub theta: f64,
    pub sigma: f64,
    pub regime_flag: u8,
    pub suggested_ltv: f64,
    pub z_score: f64,
}

#[error_code]
pub enum OracleError {
    #[msg("Unauthorized authority")]
    Unauthorized,
    #[msg("Invalid LST identifier")]
    InvalidLstId,
    #[msg("LST id does not match the initialized account")]
    LstIdMismatch,
    #[msg("Risk parameters contain invalid numeric values")]
    InvalidRiskParams,
}

fn valid_lst_id(lst_id: &str) -> bool {
    !lst_id.is_empty() && lst_id.len() <= MAX_LST_ID_LEN
}

fn valid_risk_params(params: &RiskParams) -> bool {
    finite(params.theta)
        && finite(params.sigma)
        && finite(params.z_score)
        && finite(params.suggested_ltv)
        && params.suggested_ltv >= MIN_LTV
        && params.suggested_ltv <= MAX_LTV
}

fn finite(value: f64) -> bool {
    !value.is_nan() && !value.is_infinite()
}
