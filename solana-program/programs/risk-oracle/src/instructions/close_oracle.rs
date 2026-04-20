use anchor_lang::prelude::*;
use crate::state::RiskState;
use crate::errors::OracleError;

#[derive(Accounts)]
pub struct CloseOracle<'info> {
    #[account(
        mut,
        close = authority,
        seeds = [b"risk", risk_state.lst_id.as_bytes()],
        bump,
        has_one = authority @ OracleError::Unauthorized,
    )]
    pub risk_state: Account<'info, RiskState>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn handler(_ctx: Context<CloseOracle>) -> Result<()> {
    Ok(())
}
