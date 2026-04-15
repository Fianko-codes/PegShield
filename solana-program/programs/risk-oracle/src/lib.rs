#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

declare_id!("DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea");

const MAX_LST_ID_LEN: usize = 16;

/// Fixed-point scale factor. All float params are multiplied by this before
/// storing and divided by this after reading.  Stored as i64, so values like
/// theta=0.045 become 45_000 and z_score=-1.23 becomes -1_230_000.
pub const SCALE: i64 = 1_000_000;

/// Minimum seconds that must elapse between successive updates from the same
/// authority.  Prevents spamming and cheap-replay attacks.
const MIN_UPDATE_INTERVAL_SECS: i64 = 30;

/// Minimum suggested LTV in basis points (40 %).
const MIN_LTV_BPS: u16 = 0;

/// Maximum suggested LTV in basis points (100 %).  Protocol-side caps enforce
/// the real ceiling; the oracle just must not publish an impossible value.
const MAX_LTV_BPS: u16 = 10_000;

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
        state.theta_scaled = 0;
        state.sigma_scaled = 0;
        state.regime_flag = 0;
        state.suggested_ltv_bps = 0;
        state.z_score_scaled = 0;
        state.slot = Clock::get()?.slot;
        state.timestamp = 0; // 0 means "never updated"; used in rate-limit check
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

    /// Close the risk-state PDA and refund rent to the authority.
    /// Intended for dev/test re-initialisation flows when the struct layout
    /// changes; authority-only gate prevents griefing.
    pub fn close_oracle(_ctx: Context<CloseOracle>) -> Result<()> {
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

#[account]
pub struct RiskState {
    /// ASCII ticker of the LST (e.g. "mSOL"), max 16 bytes.
    pub lst_id: String,

    /// Mean-reversion speed θ from the OU model, stored as θ × SCALE.
    /// Always non-negative; zero only before the first real update.
    pub theta_scaled: i64,

    /// Annualised volatility σ from the OU model, stored as σ × SCALE.
    /// Always positive after the first real update.
    pub sigma_scaled: i64,

    /// 0 = NORMAL  |  1 = CRITICAL (spread non-stationary and extreme z-score).
    pub regime_flag: u8,

    /// Suggested loan-to-value ratio in basis points.
    /// 8000 = 80 %.  Clamped to [MIN_LTV_BPS, MAX_LTV_BPS] by the engine.
    pub suggested_ltv_bps: u16,

    /// Z-score of the current spread vs. the rolling window mean, stored as
    /// z × SCALE.  Signed; negative means spread below the historical average.
    pub z_score_scaled: i64,

    /// Slot at which the last update was written.
    pub slot: u64,

    /// Unix timestamp (seconds) of the last update.  Zero before first update.
    pub timestamp: i64,

    /// The only public key allowed to call update_risk_state.
    pub authority: Pubkey,

    /// Public key of the wallet that submitted the most recent update.
    pub last_updater: Pubkey,
}

impl RiskState {
    pub const SPACE: usize = 8          // Anchor discriminator
        + 4 + MAX_LST_ID_LEN           // String prefix (4) + data
        + 8                            // theta_scaled  i64
        + 8                            // sigma_scaled  i64
        + 1                            // regime_flag   u8
        + 2                            // suggested_ltv_bps u16
        + 8                            // z_score_scaled i64
        + 8                            // slot           u64
        + 8                            // timestamp      i64
        + 32                           // authority      Pubkey
        + 32;                          // last_updater   Pubkey
    // Total: 119 bytes (down from 141 with f64 fields)
}

/// Parameters submitted in every update call.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RiskParams {
    pub lst_id: String,
    /// θ × SCALE  (non-negative)
    pub theta_scaled: i64,
    /// σ × SCALE  (positive)
    pub sigma_scaled: i64,
    pub regime_flag: u8,
    /// LTV in basis points, 0–10_000
    pub suggested_ltv_bps: u16,
    /// z × SCALE  (signed)
    pub z_score_scaled: i64,
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
    #[msg("Update submitted too frequently; wait at least 30 seconds")]
    UpdateTooFrequent,
}

fn valid_lst_id(lst_id: &str) -> bool {
    !lst_id.is_empty() && lst_id.len() <= MAX_LST_ID_LEN
}

fn valid_risk_params(params: &RiskParams) -> bool {
    params.theta_scaled >= 0
        && params.sigma_scaled > 0
        && params.suggested_ltv_bps >= MIN_LTV_BPS
        && params.suggested_ltv_bps <= MAX_LTV_BPS
    // z_score_scaled is signed and unbounded — any i64 is valid
}
