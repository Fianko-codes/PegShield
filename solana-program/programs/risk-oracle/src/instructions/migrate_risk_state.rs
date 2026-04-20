use std::io::Cursor;

use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::OracleError;
use crate::state::{LegacyRiskState, RiskState};
use crate::constants::MAX_LST_ID_LEN;

#[derive(Accounts)]
#[instruction(lst_id: String)]
pub struct MigrateRiskState<'info> {
    /// CHECK: validated manually because this instruction must deserialize both legacy
    /// and current layouts.
    #[account(
        mut,
        seeds = [b"risk", lst_id.as_bytes()],
        bump,
        owner = crate::ID,
    )]
    pub risk_state: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigrateRiskState>, lst_id: String) -> Result<()> {
    require!(valid_lst_id(&lst_id), OracleError::InvalidLstId);

    let risk_state_info = ctx.accounts.risk_state.to_account_info();
    let current_len = risk_state_info.data_len();

    if current_len >= RiskState::SPACE {
        let data = risk_state_info.try_borrow_data()?;
        let upgraded = RiskState::try_deserialize(&mut &data[..])
            .map_err(|_| error!(OracleError::InvalidRiskStateAccount))?;

        require!(upgraded.lst_id == lst_id, OracleError::LstIdMismatch);
        require_keys_eq!(
            upgraded.authority,
            ctx.accounts.authority.key(),
            OracleError::Unauthorized
        );

        msg!("Risk state for {} is already on the current layout", lst_id);
        return Ok(());
    }

    let legacy = {
        let data = risk_state_info.try_borrow_data()?;
        LegacyRiskState::deserialize(&mut &data[8..])
            .map_err(|_| error!(OracleError::InvalidRiskStateAccount))?
    };

    require!(legacy.lst_id == lst_id, OracleError::LstIdMismatch);
    require_keys_eq!(
        legacy.authority,
        ctx.accounts.authority.key(),
        OracleError::Unauthorized
    );

    let new_rent_minimum = Rent::get()?.minimum_balance(RiskState::SPACE);
    let current_lamports = risk_state_info.lamports();
    if new_rent_minimum > current_lamports {
        let top_up = new_rent_minimum - current_lamports;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: risk_state_info.clone(),
                },
            ),
            top_up,
        )?;
    }

    risk_state_info.resize(RiskState::SPACE)?;

    let upgraded = legacy.upgrade();
    let mut data = risk_state_info.try_borrow_mut_data()?;
    let mut cursor = Cursor::new(&mut data[..]);
    upgraded
        .try_serialize(&mut cursor)
        .map_err(|_| error!(OracleError::InvalidRiskStateAccount))?;

    msg!("Risk state for {} migrated to the current layout", lst_id);
    Ok(())
}

fn valid_lst_id(lst_id: &str) -> bool {
    !lst_id.is_empty() && lst_id.len() <= MAX_LST_ID_LEN
}
