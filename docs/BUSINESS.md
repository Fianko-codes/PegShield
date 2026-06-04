# Business Model

PegShield sells collateral-risk infrastructure to lending protocols that accept LSTs as collateral.

## Customer

Primary customer:

- Solana lending protocols
- protocols listing `mSOL`, `jitoSOL`, `bSOL`, or future LST / LRT collateral
- teams where bad-debt prevention matters more than maximizing collateral velocity during stress

Buyer:

- founder / protocol lead at smaller teams
- risk lead or governance contributor at mature protocols
- integration engineer who owns borrow-market risk controls

User:

- protocol risk operator
- lending-market integrator
- on-chain program consuming the `RiskState` PDA or PegShield Gate

## Problem

LST collateral risk can change faster than lending governance can react. Static collateral factors are useful during normal markets, but they are too slow during:

- depeg events
- liquidity withdrawals
- reflexive deleveraging
- oracle confidence widening
- reference-rate or source-quality degradation

Protocols already have price oracles. They still need a live answer to a different question: should this collateral keep receiving credit right now?

## Product

PegShield is a protocol-level risk oracle and borrow-path circuit breaker.

The lender can adopt it in three ways:

| Integration level | What the protocol gets |
|---|---|
| SDK read | Decode `RiskState`, check freshness/regime, apply `safeLtv` |
| On-chain gate | Use PegShield Gate as a borrow policy module |
| Managed risk feed | PegShield runs the update pipeline, attester operations, monitoring, and support |

The product surface is intentionally asymmetric: PegShield can tighten credit quickly, but the consuming protocol keeps its own max LTV cap and conservative fallback.

## Pricing

Initial revenue model: protocol-level licensing.

| Stage | Model | Notes |
|---|---|---|
| Design partner | Free or discounted | Goal is production feedback and integration proof |
| Early production | Annual license per protocol | Includes SDK support, feed access, integration support, and monitoring |
| Mature production | Base license plus market coverage | Price scales with number of collateral markets and operational obligations |
| High-value integrations | License plus success / usage component | Optional fee tied to covered TVL or protected collateral markets |

Why SaaS/licensing instead of pure on-chain fees:

- risk teams buy reliability, monitoring, and accountability
- protocols need support during market stress
- attester operations and legal/compliance work are real ongoing costs
- borrow-path decisions are not always a clean transaction-fee surface

## Wedge

Start with Solana LST lending because:

- LST collateral is large and reflexive
- Solana protocols can enforce PDA reads directly inside the borrow path
- LSTs need risk signals beyond raw USD price
- static governance LTVs remain the default

Near-term wedge:

1. Get one design-partner lending protocol to evaluate PegShield against its existing LST collateral rules.
2. Run PegShield in shadow mode beside its current borrow policy.
3. Produce a postmortem-style report: when PegShield would tighten, when it would recover, and how many risky borrows it would have blocked.
4. Convert shadow-mode confidence into a paid production integration.

## Why Now

LSTs have become major collateral assets, but risk controls are still mostly static. The market has learned that staking derivatives can depeg, liquidity can disappear, and governance can lag. As more LST and restaking assets enter lending markets, protocols need automated collateral controls that are faster than governance but more conservative than price-only liquidation logic.

## Competitive Position

PegShield is not trying to replace price oracles.

| Category | What they answer | PegShield position |
|---|---|---|
| Price oracle | What is the asset worth? | Complementary input |
| Risk dashboard | What does risk look like? | Less enforceable |
| Governance parameter update | What should collateral factors be? | Too slow during stress |
| Internal risk script | What should this protocol do? | Hard to reuse and trust externally |
| PegShield | Should lending continue, and at what LTV? | Enforceable on-chain primitive |

## Milestones

| Timeframe | Milestone |
|---|---|
| Now | Devnet program, SDK, CLI, stress suite, multi-attester code, borrow-gate reference |
| 2 weeks | 5-10 design-partner calls, one shadow-mode target, mainnet decision checklist |
| 4-6 weeks | Mainnet-Beta minimal deployment or hosted shadow-mode deployment, depending on legal/funding constraints |
| 8-12 weeks | First production lender integration or signed pilot |
| Post-pilot | Independent attester set, external audit, production monitoring, paid license |

## Use Of Funding

External funding accelerates the work that should not be bootstrapped casually:

- mainnet deployment and ongoing RPC/update costs
- legal wrapper outside a restrictive jurisdiction
- independent attester onboarding and custody setup
- audit budget
- design-partner travel, integrations, and support

The technical proof exists. The next milestone is commercial proof: protocols willing to run PegShield in shadow mode, then production.
