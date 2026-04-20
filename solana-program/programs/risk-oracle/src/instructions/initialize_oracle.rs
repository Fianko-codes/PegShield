use anchor_lang::prelude::*;
use crate::state::RiskState;
use crate::errors::OracleError;
use crate::constants::MAX_LST_ID_LEN;

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

pub fn handler(
    ctx: Context<InitializeOracle>,
    lst_id: String,
    authority: Pubkey,
) -> Result<()> {
    require!(valid_lst_id(&lst_id), OracleError::InvalidLstId);

    let state = &mut ctx.accounts.risk_state;
    state.lst_id = lst_id;
    state.theta_scaled = 0;
    state.sigma_scaled = 0;
    state.regime_flag = 0;
    state.suggested_ltv_bps = 0;
    state.z_score_scaled = 0;
    state.slot = Clock::get()?.slot;
    state.timestamp = 0;
    state.authority = authority;
    state.last_updater = authority;
    state.update_mode = 0; // single-attester mode by default
    state.attester_registry = Pubkey::default();

    Ok(())
}

fn valid_lst_id(lst_id: &str) -> bool {
    !lst_id.is_empty() && lst_id.len() <= MAX_LST_ID_LEN
}
