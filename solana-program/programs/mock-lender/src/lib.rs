#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;
use risk_oracle::state::RiskState;

declare_id!("FkJrXyze9iFAmH7vUDtymAP3hzS3TaLAG16hQo6svv7p");

const BORROW_POLICY_SEED: &[u8] = b"borrow_policy";
const BORROW_DECISION_SEED: &[u8] = b"borrow_decision";
const MAX_LST_ID_LEN: usize = 16;

#[program]
pub mod mock_lender {
    use super::*;

    pub fn initialize_borrow_policy(
        ctx: Context<InitializeBorrowPolicy>,
        lst_id: String,
        params: BorrowPolicyParams,
    ) -> Result<()> {
        validate_lst_id(&lst_id)?;
        validate_policy_params(&params)?;

        let policy = &mut ctx.accounts.borrow_policy;
        policy.market_admin = ctx.accounts.market_admin.key();
        policy.lst_id = lst_id;
        policy.max_ltv_bps = params.max_ltv_bps;
        policy.fallback_ltv_bps = params.fallback_ltv_bps;
        policy.max_oracle_age_secs = params.max_oracle_age_secs;
        policy.halt_on_critical = params.halt_on_critical;
        policy.paused = params.paused;
        policy.bump = ctx.bumps.borrow_policy;
        policy.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn update_borrow_policy(
        ctx: Context<UpdateBorrowPolicy>,
        _lst_id: String,
        params: BorrowPolicyParams,
    ) -> Result<()> {
        validate_policy_params(&params)?;

        let policy = &mut ctx.accounts.borrow_policy;
        policy.max_ltv_bps = params.max_ltv_bps;
        policy.fallback_ltv_bps = params.fallback_ltv_bps;
        policy.max_oracle_age_secs = params.max_oracle_age_secs;
        policy.halt_on_critical = params.halt_on_critical;
        policy.paused = params.paused;
        policy.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn assess_borrow(
        ctx: Context<AssessBorrow>,
        lst_id: String,
        collateral_value_usd: u64,
        requested_borrow_usd: u64,
    ) -> Result<()> {
        let policy = &ctx.accounts.borrow_policy;
        let risk_state = &ctx.accounts.risk_state;
        require!(policy.lst_id == lst_id, LenderError::LstMismatch);
        require!(risk_state.lst_id == lst_id, LenderError::LstMismatch);

        let now = Clock::get()?.unix_timestamp;
        let assessment = assess_request(
            now,
            policy,
            risk_state.timestamp,
            risk_state.regime_flag,
            risk_state.suggested_ltv_bps,
            collateral_value_usd,
            requested_borrow_usd,
        )?;

        let decision = &mut ctx.accounts.borrow_decision;
        decision.borrower = ctx.accounts.borrower.key();
        decision.borrow_policy = policy.key();
        decision.lst_id = lst_id;
        decision.collateral_value_usd = collateral_value_usd;
        decision.requested_borrow_usd = requested_borrow_usd;
        decision.max_safe_borrow_usd = assessment.max_safe_borrow_usd;
        decision.oracle_ltv_bps = risk_state.suggested_ltv_bps;
        decision.applied_ltv_bps = assessment.applied_ltv_bps;
        decision.fallback_ltv_bps = policy.fallback_ltv_bps;
        decision.max_policy_ltv_bps = policy.max_ltv_bps;
        decision.regime_flag = risk_state.regime_flag;
        decision.oracle_timestamp = risk_state.timestamp;
        decision.oracle_age_seconds = assessment.oracle_age_seconds;
        decision.evaluated_at = now;
        decision.allowed = assessment.allowed;
        decision.reason_code = assessment.reason_code as u8;

        msg!(
            "Borrow assessment for {}: allowed={} reason={} max_safe_borrow_usd={}",
            decision.lst_id,
            decision.allowed,
            decision.reason_code,
            decision.max_safe_borrow_usd
        );

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BorrowPolicyParams {
    pub max_ltv_bps: u16,
    pub fallback_ltv_bps: u16,
    pub max_oracle_age_secs: i64,
    pub halt_on_critical: bool,
    pub paused: bool,
}

#[derive(Accounts)]
#[instruction(lst_id: String)]
pub struct InitializeBorrowPolicy<'info> {
    #[account(
        init,
        payer = market_admin,
        space = BorrowPolicy::SPACE,
        seeds = [BORROW_POLICY_SEED, lst_id.as_bytes()],
        bump
    )]
    pub borrow_policy: Account<'info, BorrowPolicy>,

    #[account(mut)]
    pub market_admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(lst_id: String)]
pub struct UpdateBorrowPolicy<'info> {
    #[account(
        mut,
        seeds = [BORROW_POLICY_SEED, lst_id.as_bytes()],
        bump,
        has_one = market_admin @ LenderError::Unauthorized
    )]
    pub borrow_policy: Account<'info, BorrowPolicy>,

    pub market_admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(lst_id: String)]
pub struct AssessBorrow<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,

    #[account(
        init_if_needed,
        payer = borrower,
        space = BorrowDecision::SPACE,
        seeds = [BORROW_DECISION_SEED, borrower.key().as_ref(), lst_id.as_bytes()],
        bump
    )]
    pub borrow_decision: Account<'info, BorrowDecision>,

    #[account(
        seeds = [BORROW_POLICY_SEED, lst_id.as_bytes()],
        bump,
        constraint = borrow_policy.lst_id == lst_id @ LenderError::LstMismatch
    )]
    pub borrow_policy: Account<'info, BorrowPolicy>,

    #[account(
        seeds = [b"risk", lst_id.as_bytes()],
        bump,
        seeds::program = risk_oracle::ID,
    )]
    pub risk_state: Account<'info, RiskState>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct BorrowPolicy {
    pub market_admin: Pubkey,
    pub lst_id: String,
    pub max_ltv_bps: u16,
    pub fallback_ltv_bps: u16,
    pub max_oracle_age_secs: i64,
    pub halt_on_critical: bool,
    pub paused: bool,
    pub bump: u8,
    pub updated_at: i64,
}

impl BorrowPolicy {
    pub const SPACE: usize = 8 + 32 + 4 + MAX_LST_ID_LEN + 2 + 2 + 8 + 1 + 1 + 1 + 8;
}

#[account]
pub struct BorrowDecision {
    pub borrower: Pubkey,
    pub borrow_policy: Pubkey,
    pub lst_id: String,
    pub collateral_value_usd: u64,
    pub requested_borrow_usd: u64,
    pub max_safe_borrow_usd: u64,
    pub oracle_ltv_bps: u16,
    pub applied_ltv_bps: u16,
    pub fallback_ltv_bps: u16,
    pub max_policy_ltv_bps: u16,
    pub regime_flag: u8,
    pub oracle_timestamp: i64,
    pub oracle_age_seconds: i64,
    pub evaluated_at: i64,
    pub allowed: bool,
    pub reason_code: u8,
}

impl BorrowDecision {
    pub const SPACE: usize =
        8 + 32 + 32 + 4 + MAX_LST_ID_LEN + 8 + 8 + 8 + 2 + 2 + 2 + 2 + 1 + 8 + 8 + 8 + 1 + 1;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DecisionReason {
    Approved = 0,
    StaleOracle = 1,
    CriticalRegime = 2,
    ExceedsLtv = 3,
    PolicyPaused = 4,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BorrowAssessment {
    pub allowed: bool,
    pub reason_code: DecisionReason,
    pub max_safe_borrow_usd: u64,
    pub oracle_age_seconds: i64,
    pub applied_ltv_bps: u16,
}

fn assess_request(
    now: i64,
    policy: &BorrowPolicy,
    oracle_timestamp: i64,
    regime_flag: u8,
    oracle_ltv_bps: u16,
    collateral_value_usd: u64,
    requested_borrow_usd: u64,
) -> Result<BorrowAssessment> {
    let oracle_age_seconds = if oracle_timestamp <= 0 {
        i64::MAX
    } else {
        now.saturating_sub(oracle_timestamp)
    };

    if policy.paused {
        return Ok(BorrowAssessment {
            allowed: false,
            reason_code: DecisionReason::PolicyPaused,
            max_safe_borrow_usd: 0,
            oracle_age_seconds,
            applied_ltv_bps: 0,
        });
    }

    let mut reason_code = DecisionReason::Approved;
    let applied_ltv_bps = if oracle_age_seconds > policy.max_oracle_age_secs {
        reason_code = DecisionReason::StaleOracle;
        policy.fallback_ltv_bps
    } else if regime_flag != 0 {
        reason_code = DecisionReason::CriticalRegime;
        if policy.halt_on_critical {
            0
        } else {
            policy.fallback_ltv_bps
        }
    } else {
        oracle_ltv_bps.min(policy.max_ltv_bps)
    };

    let max_safe_borrow_usd = mul_div_u64(collateral_value_usd, applied_ltv_bps as u64, 10_000)?;

    if reason_code == DecisionReason::CriticalRegime && policy.halt_on_critical {
        return Ok(BorrowAssessment {
            allowed: false,
            reason_code,
            max_safe_borrow_usd,
            oracle_age_seconds,
            applied_ltv_bps,
        });
    }

    if requested_borrow_usd > max_safe_borrow_usd {
        return Ok(BorrowAssessment {
            allowed: false,
            reason_code: if reason_code == DecisionReason::Approved {
                DecisionReason::ExceedsLtv
            } else {
                reason_code
            },
            max_safe_borrow_usd,
            oracle_age_seconds,
            applied_ltv_bps,
        });
    }

    Ok(BorrowAssessment {
        allowed: true,
        reason_code,
        max_safe_borrow_usd,
        oracle_age_seconds,
        applied_ltv_bps,
    })
}

fn validate_lst_id(lst_id: &str) -> Result<()> {
    require!(!lst_id.is_empty(), LenderError::InvalidPolicy);
    require!(lst_id.len() <= MAX_LST_ID_LEN, LenderError::InvalidPolicy);
    Ok(())
}

fn validate_policy_params(params: &BorrowPolicyParams) -> Result<()> {
    require!(
        params.max_ltv_bps <= 10_000
            && params.fallback_ltv_bps <= params.max_ltv_bps
            && params.max_oracle_age_secs > 0,
        LenderError::InvalidPolicy
    );
    Ok(())
}

fn mul_div_u64(value: u64, numerator: u64, denominator: u64) -> Result<u64> {
    require!(denominator > 0, LenderError::MathOverflow);
    let result = (value as u128)
        .checked_mul(numerator as u128)
        .ok_or(LenderError::MathOverflow)?
        .checked_div(denominator as u128)
        .ok_or(LenderError::MathOverflow)?;
    result
        .try_into()
        .map_err(|_| LenderError::MathOverflow.into())
}

#[error_code]
pub enum LenderError {
    #[msg("LST id did not match the oracle account")]
    LstMismatch,
    #[msg("Overflow while evaluating borrow limits")]
    MathOverflow,
    #[msg("Borrow policy parameters are invalid")]
    InvalidPolicy,
    #[msg("Signer is not authorized for this borrow policy")]
    Unauthorized,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(
        max_ltv_bps: u16,
        fallback_ltv_bps: u16,
        max_oracle_age_secs: i64,
        halt_on_critical: bool,
        paused: bool,
    ) -> BorrowPolicy {
        BorrowPolicy {
            market_admin: Pubkey::default(),
            lst_id: "mSOL-v2".to_string(),
            max_ltv_bps,
            fallback_ltv_bps,
            max_oracle_age_secs,
            halt_on_critical,
            paused,
            bump: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn approves_healthy_borrow_request() {
        let policy = policy(8_000, 4_000, 600, true, false);
        let assessment = assess_request(
            1_700_000_600,
            &policy,
            1_700_000_000,
            0,
            7_500,
            10_000,
            7_000,
        )
        .unwrap();
        assert!(assessment.allowed);
        assert_eq!(assessment.reason_code, DecisionReason::Approved);
        assert_eq!(assessment.max_safe_borrow_usd, 7_500);
        assert_eq!(assessment.oracle_age_seconds, 600);
        assert_eq!(assessment.applied_ltv_bps, 7_500);
    }

    #[test]
    fn stale_oracle_uses_fallback_policy() {
        let policy = policy(8_000, 4_000, 600, true, false);
        let assessment = assess_request(
            1_700_000_601,
            &policy,
            1_700_000_000,
            0,
            7_500,
            10_000,
            3_500,
        )
        .unwrap();
        assert!(assessment.allowed);
        assert_eq!(assessment.reason_code, DecisionReason::StaleOracle);
        assert_eq!(assessment.max_safe_borrow_usd, 4_000);
        assert_eq!(assessment.applied_ltv_bps, 4_000);
    }

    #[test]
    fn stale_oracle_rejects_above_fallback_policy() {
        let policy = policy(8_000, 4_000, 600, true, false);
        let assessment = assess_request(
            1_700_000_601,
            &policy,
            1_700_000_000,
            0,
            7_500,
            10_000,
            7_000,
        )
        .unwrap();
        assert!(!assessment.allowed);
        assert_eq!(assessment.reason_code, DecisionReason::StaleOracle);
        assert_eq!(assessment.max_safe_borrow_usd, 4_000);
    }

    #[test]
    fn critical_regime_can_halt_new_borrows() {
        let policy = policy(8_000, 4_000, 600, true, false);
        let assessment =
            assess_request(1_700_000_100, &policy, 1_700_000_000, 1, 7_500, 10_000, 1).unwrap();
        assert!(!assessment.allowed);
        assert_eq!(assessment.reason_code, DecisionReason::CriticalRegime);
        assert_eq!(assessment.max_safe_borrow_usd, 0);
        assert_eq!(assessment.applied_ltv_bps, 0);
    }

    #[test]
    fn critical_regime_can_use_fallback_ltv() {
        let policy = policy(8_000, 4_000, 600, false, false);
        let assessment = assess_request(
            1_700_000_100,
            &policy,
            1_700_000_000,
            1,
            7_500,
            10_000,
            3_000,
        )
        .unwrap();
        assert!(assessment.allowed);
        assert_eq!(assessment.reason_code, DecisionReason::CriticalRegime);
        assert_eq!(assessment.max_safe_borrow_usd, 4_000);
    }

    #[test]
    fn rejects_borrows_above_safe_ltv() {
        let policy = policy(8_000, 4_000, 600, true, false);
        let assessment = assess_request(
            1_700_000_100,
            &policy,
            1_700_000_000,
            0,
            6_000,
            10_000,
            7_000,
        )
        .unwrap();
        assert!(!assessment.allowed);
        assert_eq!(assessment.reason_code, DecisionReason::ExceedsLtv);
        assert_eq!(assessment.max_safe_borrow_usd, 6_000);
    }

    #[test]
    fn clamps_oracle_ltv_to_policy_cap() {
        let policy = policy(7_000, 4_000, 600, true, false);
        let assessment = assess_request(
            1_700_000_100,
            &policy,
            1_700_000_000,
            0,
            8_500,
            10_000,
            7_000,
        )
        .unwrap();
        assert!(assessment.allowed);
        assert_eq!(assessment.max_safe_borrow_usd, 7_000);
        assert_eq!(assessment.applied_ltv_bps, 7_000);
    }

    #[test]
    fn paused_policy_rejects_borrows() {
        let policy = policy(8_000, 4_000, 600, true, true);
        let assessment =
            assess_request(1_700_000_100, &policy, 1_700_000_000, 0, 7_500, 10_000, 1).unwrap();
        assert!(!assessment.allowed);
        assert_eq!(assessment.reason_code, DecisionReason::PolicyPaused);
        assert_eq!(assessment.max_safe_borrow_usd, 0);
    }

    #[test]
    fn rejects_invalid_policy_params() {
        let params = BorrowPolicyParams {
            max_ltv_bps: 8_000,
            fallback_ltv_bps: 8_001,
            max_oracle_age_secs: 600,
            halt_on_critical: true,
            paused: false,
        };
        assert!(validate_policy_params(&params).is_err());
    }
}
