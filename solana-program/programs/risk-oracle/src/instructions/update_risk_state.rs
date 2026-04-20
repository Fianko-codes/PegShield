use anchor_lang::prelude::*;
use crate::state::RiskState;
use crate::errors::OracleError;
use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateRiskParams {
    pub lst_id: String,
    pub theta_scaled: i64,
    pub sigma_scaled: i64,
    pub regime_flag: u8,
    pub suggested_ltv_bps: u16,
    pub z_score_scaled: i64,
}

#[derive(Accounts)]
#[instruction(params: UpdateRiskParams)]
pub struct UpdateRiskState<'info> {
    #[account(
        mut,
        seeds = [b"risk", params.lst_id.as_bytes()],
        bump
    )]
    pub risk_state: Account<'info, RiskState>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateRiskState>, params: UpdateRiskParams) -> Result<()> {
    let state = &mut ctx.accounts.risk_state;

    // Reject if in multi-attester mode
    require!(
        !state.is_multi_attester(),
        OracleError::MultiAttesterModeActive
    );

    require!(valid_lst_id(&params.lst_id), OracleError::InvalidLstId);
    require!(valid_risk_params(&params), OracleError::InvalidRiskParams);

    require_keys_eq!(
        ctx.accounts.authority.key(),
        state.authority,
        OracleError::Unauthorized
    );
    require!(state.lst_id == params.lst_id, OracleError::LstIdMismatch);

    let now = Clock::get()?.unix_timestamp;
    require!(
        state.timestamp == 0 || now - state.timestamp >= MIN_UPDATE_INTERVAL_SECS,
        OracleError::UpdateTooFrequent
    );

    state.theta_scaled = params.theta_scaled;
    state.sigma_scaled = params.sigma_scaled;
    state.regime_flag = params.regime_flag;
    state.suggested_ltv_bps = params.suggested_ltv_bps;
    state.z_score_scaled = params.z_score_scaled;
    state.slot = Clock::get()?.slot;
    state.timestamp = now;
    state.last_updater = ctx.accounts.authority.key();

    Ok(())
}

fn valid_lst_id(lst_id: &str) -> bool {
    !lst_id.is_empty() && lst_id.len() <= MAX_LST_ID_LEN
}

fn valid_risk_params(params: &UpdateRiskParams) -> bool {
    params.theta_scaled >= 0
        && params.sigma_scaled > 0
        && params.suggested_ltv_bps >= MIN_LTV_BPS
        && params.suggested_ltv_bps <= MAX_LTV_BPS
}
