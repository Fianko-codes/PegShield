# Mainnet Decision

PegShield is intentionally devnet-first today. That is a product and operations decision, not a lack of core implementation.

## Current Position

The core PegShield architecture is code-complete, tested, and deployed to Solana devnet:

- off-chain bridge for Pyth prices and canonical LST reference rates
- statistical pipeline with OU calibration, ADF regime detection, z-score, and LTV mapping
- source-quality and liquidity haircuts
- `RiskState` PDA with live LTV, regime, freshness, and diagnostics
- typed SDK and operator CLI
- PegShield Gate borrow-path reference program
- multi-attester registry, confirmations, dispute, and slashing flow
- historical and synthetic stress proof suite

Mainnet-Beta deployment has been deferred because deploying an oracle-like primitive to mainnet creates obligations beyond "the program exists."

## Why Mainnet Is Deferred

### 1. Capital efficiency

The deploy is not free, and current resources are self-funded.

Approximate minimal mainnet budget from `DEPLOY.md`:

| Item | Approximate cost |
|---|---|
| Program deploy | `3.5-5 SOL` |
| One `RiskState` PDA | `~0.002 SOL` |
| Ongoing updater transactions | `~0.0015 SOL/day` at 5-minute cadence |
| Recommended starting balance | `6 SOL` plus buffer |

Spending that before a serious design partner exists would create a credibility artifact, but not necessarily customer evidence.

### 2. Operational security

Mainnet means production key custody, upgrade authority policy, monitoring, incident response, paid RPC, and a path to independent attesters. A devnet feed can prove architecture. A mainnet feed must be operated like infrastructure.

### 3. Legal exposure

PegShield is currently being built from Nepal, where crypto-asset activity is legally restrictive. A mainnet deployment that looks like production financial infrastructure should wait for a cleaner legal wrapper, operating structure, and funding base.

## External Explanation

PegShield's core architecture is code-complete, tested, and deployed to Solana Devnet: the off-chain statistical pipeline, multi-attester slashing registry, typed SDK, operator CLI, and on-chain borrow enforcement gate are all implemented. Mainnet-Beta deployment is intentionally deferred because the current priority is proof-of-execution, not performative deployment. Mainnet introduces real operational obligations: funded deployer costs, production attester custody, monitoring, and legal exposure from Nepal's restrictive crypto environment. Until those constraints are resolved, PegShield is proving correctness through deterministic verification, historical stress replays, and a complete developer integration surface.

## What "Minimal Mainnet" Means

Minimal mainnet is a credibility deployment, not full production:

- deploy `risk_oracle` to `mainnet-beta`
- initialize one `RiskState` PDA for `mSOL-v2`
- run single-attester mode initially
- wire a mainnet updater job
- publish explorer links and SDK config

This would let lenders read a real mainnet account, but it would still not imply:

- audited production readiness
- independent attester decentralization
- immutable upgrade authority
- signed lender integration

## Mainnet Readiness Checklist

Do not press mainnet until these are true or consciously waived:

| Requirement | Status needed |
|---|---|
| Funded deployer | At least `6 SOL` plus buffer |
| Paid RPC | Dedicated mainnet endpoint |
| Key custody | Deployer and updater separated |
| Upgrade authority | Multisig plan or explicit temporary authority |
| Monitoring | Alerts for stale PDA, updater failure, critical regime |
| Attester plan | Independent operators identified or staged |
| Legal wrapper | Clear operating entity or counsel-reviewed plan |
| Customer reason | Design partner, shadow-mode pilot, or investor deadline |

## Recommended Decision

Do not rush a mainnet deployment just to say "mainnet." The stronger position is:

- the architecture is implemented
- devnet exists
- the verification path is deterministic
- mainnet is deliberately gated on funding, legal structure, monitoring, and attester operations

If a stronger external signal is required, execute the minimal mainnet path only after funding the deployer and writing the monitoring runbook. Do not imply production readiness from a single-attester mainnet PDA.
