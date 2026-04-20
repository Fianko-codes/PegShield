#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use risk_oracle::state::RiskState;

declare_id!("FkJrXyze9iFAmH7vUDtymAP3hzS3TaLAG16hQo6svv7p");

const BORROW_DECISION_SEED: &[u8] = b"borrow_decision";
const MAX_LST_ID_LEN: usize = 16;
const MAX_ORACLE_AGE_SECS: i64 = 600;

#[program]
pub mod mock_lender {
    use super::*;

    pub fn assess_borrow(
        ctx: Context<AssessBorrow>,
        lst_id: String,
        collateral_value_usd: u64,
        requested_borrow_usd: u64,
    ) -> Result<()> {
        let risk_state = &ctx.accounts.risk_state;
        require!(risk_state.lst_id == lst_id, LenderError::LstMismatch);

        let now = Clock::get()?.unix_timestamp;
        let assessment = assess_request(
            now,
            risk_state.timestamp,
            risk_state.regime_flag,
            risk_state.suggested_ltv_bps,
            collateral_value_usd,
            requested_borrow_usd,
        )?;

        let decision = &mut ctx.accounts.borrow_decision;
        decision.borrower = ctx.accounts.borrower.key();
        decision.lst_id = lst_id;
        decision.collateral_value_usd = collateral_value_usd;
        decision.requested_borrow_usd = requested_borrow_usd;
        decision.max_safe_borrow_usd = assessment.max_safe_borrow_usd;
        decision.oracle_ltv_bps = risk_state.suggested_ltv_bps;
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
        seeds = [b"risk", lst_id.as_bytes()],
        bump,
        seeds::program = risk_oracle::ID,
    )]
    pub risk_state: Account<'info, RiskState>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct BorrowDecision {
    pub borrower: Pubkey,
    pub lst_id: String,
    pub collateral_value_usd: u64,
    pub requested_borrow_usd: u64,
    pub max_safe_borrow_usd: u64,
    pub oracle_ltv_bps: u16,
    pub regime_flag: u8,
    pub oracle_timestamp: i64,
    pub oracle_age_seconds: i64,
    pub evaluated_at: i64,
    pub allowed: bool,
    pub reason_code: u8,
}

impl BorrowDecision {
    pub const SPACE: usize = 8
        + 32
        + 4 + MAX_LST_ID_LEN
        + 8
        + 8
        + 8
        + 2
        + 1
        + 8
        + 8
        + 8
        + 1
        + 1;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DecisionReason {
    Approved = 0,
    StaleOracle = 1,
    CriticalRegime = 2,
    ExceedsLtv = 3,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BorrowAssessment {
    pub allowed: bool,
    pub reason_code: DecisionReason,
    pub max_safe_borrow_usd: u64,
    pub oracle_age_seconds: i64,
}

fn assess_request(
    now: i64,
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

    let max_safe_borrow_usd = collateral_value_usd
        .checked_mul(oracle_ltv_bps as u64)
        .ok_or(LenderError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(LenderError::MathOverflow)?;

    if oracle_age_seconds > MAX_ORACLE_AGE_SECS {
        return Ok(BorrowAssessment {
            allowed: false,
            reason_code: DecisionReason::StaleOracle,
            max_safe_borrow_usd,
            oracle_age_seconds,
        });
    }

    if regime_flag != 0 {
        return Ok(BorrowAssessment {
            allowed: false,
            reason_code: DecisionReason::CriticalRegime,
            max_safe_borrow_usd,
            oracle_age_seconds,
        });
    }

    if requested_borrow_usd > max_safe_borrow_usd {
        return Ok(BorrowAssessment {
            allowed: false,
            reason_code: DecisionReason::ExceedsLtv,
            max_safe_borrow_usd,
            oracle_age_seconds,
        });
    }

    Ok(BorrowAssessment {
        allowed: true,
        reason_code: DecisionReason::Approved,
        max_safe_borrow_usd,
        oracle_age_seconds,
    })
}

#[error_code]
pub enum LenderError {
    #[msg("LST id did not match the oracle account")]
    LstMismatch,
    #[msg("Overflow while evaluating borrow limits")]
    MathOverflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approves_healthy_borrow_request() {
        let assessment = assess_request(1_700_000_600, 1_700_000_000, 0, 7_500, 10_000, 7_000).unwrap();
        assert!(assessment.allowed);
        assert_eq!(assessment.reason_code, DecisionReason::Approved);
        assert_eq!(assessment.max_safe_borrow_usd, 7_500);
        assert_eq!(assessment.oracle_age_seconds, 600);
    }

    #[test]
    fn rejects_stale_oracle() {
        let assessment = assess_request(1_700_000_601, 1_700_000_000, 0, 7_500, 10_000, 7_000).unwrap();
        assert!(!assessment.allowed);
        assert_eq!(assessment.reason_code, DecisionReason::StaleOracle);
    }

    #[test]
    fn rejects_critical_regime() {
        let assessment = assess_request(1_700_000_100, 1_700_000_000, 1, 7_500, 10_000, 7_000).unwrap();
        assert!(!assessment.allowed);
        assert_eq!(assessment.reason_code, DecisionReason::CriticalRegime);
    }

    #[test]
    fn rejects_borrows_above_safe_ltv() {
        let assessment = assess_request(1_700_000_100, 1_700_000_000, 0, 6_000, 10_000, 7_000).unwrap();
        assert!(!assessment.allowed);
        assert_eq!(assessment.reason_code, DecisionReason::ExceedsLtv);
        assert_eq!(assessment.max_safe_borrow_usd, 6_000);
    }
}
