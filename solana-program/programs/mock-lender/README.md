# PegShield Gate

Reference on-chain borrow gate for protocols that want to enforce PegShield's
LST risk feed inside a lending flow.

The program is named `mock-lender` in the Anchor workspace for compatibility
with the existing reference integration, but the product surface is the reusable gate:

```text
BorrowPolicy PDA + PegShield RiskState PDA -> BorrowDecision PDA
```

## Accounts

| Account | Seeds | Purpose |
|---|---|---|
| `BorrowPolicy` | `["borrow_policy", lst_id]` | Market-level risk settings controlled by `market_admin` |
| `RiskState` | `["risk", lst_id]` under the PegShield program | Live suggested LTV, regime, and freshness |
| `BorrowDecision` | `["borrow_decision", borrower, lst_id]` | Auditable result of a borrow assessment |

## Policy Fields

| Field | Meaning |
|---|---|
| `max_ltv_bps` | Protocol cap; PegShield can never raise lending above this |
| `fallback_ltv_bps` | Conservative LTV used when the oracle is stale or critical fallback is enabled |
| `max_oracle_age_secs` | Freshness window for the PegShield PDA |
| `halt_on_critical` | If true, critical regime blocks new borrows instead of using fallback LTV |
| `paused` | Emergency switch that blocks new borrow approvals |

## Instructions

| Instruction | Purpose |
|---|---|
| `initialize_borrow_policy` | Creates the policy PDA for an LST market |
| `update_borrow_policy` | Lets the market admin change caps, fallback, freshness, critical handling, or pause state |
| `assess_borrow` | Reads `BorrowPolicy` and PegShield `RiskState`, then stores an allow/reject `BorrowDecision` |

## Safety Behavior

- Healthy oracle: applies `min(risk_state.suggested_ltv_bps, policy.max_ltv_bps)`.
- Stale oracle: applies `policy.fallback_ltv_bps`.
- Critical regime with `halt_on_critical = true`: rejects new borrows with `applied_ltv_bps = 0`.
- Critical regime with `halt_on_critical = false`: applies `policy.fallback_ltv_bps`.
- Paused policy: rejects new borrows.

All borrow-limit math uses checked `u128` intermediates and rounds down.
