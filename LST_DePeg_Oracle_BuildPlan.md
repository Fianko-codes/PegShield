# Solana LST Risk Oracle — Startup Funding Build Plan

> **One-line pitch:** A Solana-native risk oracle that publishes dynamic collateral limits for LSTs on-chain, so lending protocols can reduce bad debt before de-peg events spread through the system.

---

## 1. What We Are Building

We are building a **risk oracle on Solana**, not a generic analytics dashboard.

The product is an Anchor program on Solana devnet that stores a live risk state for an LST, starting with **mSOL**. An off-chain model computes the risk signal from market data, submits an update transaction to the program, and any Solana protocol or client can read the PDA to consume the result.

The outcome is simple:

- a lending protocol reads our risk state
- it sees the current `suggested_ltv`
- it uses that value to tighten collateral parameters during stress

This is a Solana-native primitive, not a PDF insight and not a backend-only service.

---

## 2. Why This Matters On Solana

Solana has a concentrated set of liquid staking tokens used as collateral across its lending ecosystem. When an LST drifts away from SOL during stress, protocols with static collateral factors react too slowly. That creates liquidation gaps and eventually bad debt.

This is a real Solana problem because:

- `mSOL`, `jitoSOL`, and `bSOL` are Solana-native collateral assets
- lenders like Kamino and Marginfi depend on reliable collateral assumptions
- Pyth price data and Solana account composability make this feasible on-chain

Our MVP targets the problem at the right layer:

- **Pyth** provides raw market data
- **our model** converts it into a risk signal
- **our Solana program** publishes that signal as reusable state

---

## 3. MVP Scope

### In scope

- One Solana Anchor program deployed on **devnet**
- One tracked asset for the live demo: **mSOL**
- One PDA storing the current risk state for that asset
- One updater client that submits risk updates on-chain
- One consumer demo that reads the PDA and shows how a protocol would use the value
- One simulation based on the November 2022 stress period

### Out of scope for the funding build

- Mainnet deployment
- Multi-updater decentralization
- ZK proof of model execution
- Full Kamino or Marginfi integration
- A frontend-heavy dashboard
- Supporting all LSTs in the live demo

### Positioning

We can say:

> "We are launching with mSOL on devnet, with a generic account model that extends to jitoSOL and bSOL next."

That is tighter and more credible than claiming broad asset coverage too early.

---

## 4. Product Thesis

Traditional price oracles answer:

> "What is this asset worth?"

Our Solana risk oracle answers:

> "How safe is this asset to use as collateral right now?"

That distinction matters because lending protocols do not only need price. They need a current estimate of collateral health.

Our state account stores a **decision-ready risk signal**:

- mean reversion health
- volatility stress
- regime status
- dynamic LTV suggestion

This turns raw Pyth data into something a Solana lending protocol can actually consume.

---

## 5. Solana-Native Architecture

## Components

### A. Off-chain risk engine

Runs the statistical model on recent `mSOL/SOL` spread data and produces:

- `theta`
- `sigma`
- `z_score`
- `regime_flag`
- `suggested_ltv`

### B. Solana Anchor program

Stores the latest risk state in a PDA:

```text
seeds = ["risk", "mSOL"]
```

This is the canonical on-chain record that protocols and clients read.

### C. Updater client

Takes model output and submits `update_risk_state` to the Solana program.

### D. Consumer demo

A second script reads the PDA and prints the effective collateral posture a lending protocol would use.

This consumer step is important. It proves the Solana account is not just written, but actually usable.

---

## 6. Why Judges Should Care

This project fits a Solana co-sponsored startup funding context because it demonstrates:

- a real Solana ecosystem pain point
- on-chain composability through PDA-based state
- integration with Solana-native infrastructure like Pyth and Anchor
- a path to becoming middleware for lending protocols

The pitch is not:

> "We built a model and also wrote to chain."

The pitch is:

> "We built a Solana-native risk oracle primitive that protocols can consume directly."

---

## 7. Technical Stack

### Solana

- Solana devnet
- Anchor
- Rust
- PDA-based account storage

### Data and modeling

- Python 3.11+
- `numpy`
- `pandas`
- `scipy`
- `statsmodels`
- `requests`

### Client and updater

- Node 20+
- `@coral-xyz/anchor`
- `@solana/web3.js`
- `dotenv`

---

## 8. Core Data Model

We start with one state account per LST.

For the MVP, only `mSOL` is required.

### RiskState schema

| Field | Type | Purpose |
|------|------|---------|
| `lst_id` | `String` | Asset identifier, starting with `"mSOL"` |
| `theta` | `f64` | Mean reversion strength |
| `sigma` | `f64` | Spread volatility |
| `regime_flag` | `u8` | `0 = normal`, `1 = critical` |
| `suggested_ltv` | `f64` | Recommended collateral factor |
| `z_score` | `f64` | Current spread abnormality |
| `slot` | `u64` | Solana slot when written |
| `timestamp` | `i64` | On-chain timestamp |
| `updater` | `Pubkey` | Authorized updater key |

### PDA

```text
["risk", "mSOL"]
```

Later expansion:

```text
["risk", "jitoSOL"]
["risk", "bSOL"]
```

---

## 9. Smart Contract Design

The Anchor program should do one thing well:

- validate the authorized updater
- create or update the `RiskState` PDA
- store the latest risk parameters

### Important correction from the previous draft

The updater must be **explicitly authorized on-chain**. It is not enough that a signer exists.

The program should either:

- hardcode an admin pubkey for the MVP, or
- store an authority field during initialization and require it on updates

For this funding build, the simplest acceptable design is:

- one `initialize` instruction
- one `update_risk_state` instruction
- one stored authority pubkey

That makes the Solana program look deliberate, not like a passive key-value store.

---

## 10. Risk Model

We keep the math understandable and useful.

### Signal inputs

We compute the normalized spread:

```text
(mSOL_price - SOL_price) / SOL_price
```

Then derive:

- `theta`: speed of mean reversion
- `sigma`: volatility of the spread
- `z_score`: current deviation from recent normal
- `regime_flag`: emergency state when the spread looks statistically broken

### LTV logic

We output a dynamic collateral factor:

```text
CF_adj = CF_base × clamp((theta / theta_avg) × (sigma_avg / sigma), floor, cap)
```

### Practical guardrails

- If the regime breaks, force the emergency floor
- Store calibration values in code for MVP only if they are derived from a saved baseline dataset
- Save both the baseline dataset and the resulting calibration numbers for reproducibility

That last point matters. It strengthens the claim that the oracle is verifiable rather than arbitrary.

---

## 11. Data Strategy

### Live demo data

Use recent `mSOL` and `SOL` price data from Pyth.

### Simulation data

Use the November 2022 stress window as the replay dataset for the demo chart.

### Scope control

Do not block the build on perfect historical ingestion. If Pyth historical retrieval becomes slow or awkward, use a fixed reproducible dataset for simulation and keep live fetching focused on the current demo path.

The priority order is:

1. live Solana write path works
2. consumer can read PDA
3. simulation chart clearly tells the story
4. historical ingestion is polished

That is the right ordering for judges.

---

## 12. Repository Structure

```text
risk-oracle/
|
├── README.md
├── .env.example
├── .gitignore
|
├── bridge/
│   ├── fetch_pyth.py
│   └── data/
│       └── .gitkeep
|
├── core-engine/
│   ├── ou_model.py
│   ├── regime_detector.py
│   ├── ltv_calculator.py
│   ├── pipeline.py
│   ├── calibration.py
│   └── output/
│       └── .gitkeep
|
├── solana-program/
│   ├── programs/
│   │   └── risk-oracle/
│   │       └── src/
│   │           └── lib.rs
│   ├── tests/
│   │   └── risk-oracle.ts
│   ├── Anchor.toml
│   └── Cargo.toml
|
├── updater/
│   ├── submit.ts
│   ├── read_state.ts
│   ├── keypair.json
│   └── tsconfig.json
|
└── simulation/
    ├── stress_test.py
    ├── plot.py
    └── charts/
        └── .gitkeep
```

---

## 13. Demo-Critical Deliverables

If time gets tight, these are the only outputs that truly matter:

### Deliverable 1: Solana program on devnet

- deployed Anchor program
- initialized oracle state
- updater authority enforced

### Deliverable 2: Live update transaction

- run model
- submit update
- confirm transaction
- inspect PDA fields on-chain

### Deliverable 3: Consumer read demo

- separate script reads PDA
- prints current `suggested_ltv`
- shows how a lender would apply it

### Deliverable 4: Stress simulation chart

- static LTV vs dynamic LTV
- visible reduction in exposure during the stress window

If you have these four, you have a credible funding demo.

---

## 14. Build Sequence

### Day 1 — Solana foundation first

- initialize Anchor workspace
- define `RiskState`
- add authority-controlled initialize/update flow
- build locally
- deploy to devnet
- confirm PDA creation and readback

**Checkpoint:** a live Solana program exists and a state account can be created and read

### Day 2 — End-to-end live path

- implement `submit.ts`
- implement `read_state.ts`
- connect Python output to on-chain submission
- run full path: compute -> submit -> read back

**Checkpoint:** one complete live Solana demo works for `mSOL`

### Day 3 — Risk model and calibration

- implement OU estimation
- implement regime detection
- implement LTV calculation
- derive calibration constants from a saved baseline dataset
- output clean JSON for the updater

**Checkpoint:** live model outputs look sane and produce stable on-chain updates

### Day 4 — Simulation asset

- build November 2022 replay dataset
- implement `stress_test.py`
- generate the comparison chart
- refine narrative around bad debt avoidance

**Checkpoint:** the visual story is presentation-ready

### Day 5 — Packaging and pitch

- write concise README
- rehearse the demo order
- prepare explorer links and terminal commands
- tighten the funding narrative

**Checkpoint:** complete judge-facing demo flow is reliable

---

## 15. Demo Flow

The demo should show Solana first, not Python first.

### Screen order

1. show the Solana problem in one sentence
2. show the devnet program and risk PDA
3. run the updater transaction live
4. read the PDA from a separate consumer script
5. show the stress simulation chart

### Live script

```text
1. "This is a Solana-native risk oracle for LST collateral."
2. "We update risk state for mSOL on Solana devnet."
3. Run the pipeline and submit the update transaction.
4. Read the PDA back from a second client to show composability.
5. Show the November 2022 replay and explain how dynamic LTV reduces exposure."
```

This makes the chain component feel central.

---

## 16. Funding Narrative

For startup funding judges, the strongest framing is:

- We are not competing with price oracles
- We are a middleware layer for risk-adjusted collateral decisions
- Solana is the right starting chain because LST collateral is a visible ecosystem need

### Business framing

Potential customers:

- lending protocols
- risk teams
- treasury and collateral managers

Potential product forms:

- on-chain oracle feed
- risk API for governance and risk teams
- managed updater service before decentralization

### Why now

As Solana DeFi matures, protocols need richer risk infrastructure than spot price alone. Static collateral factors are simple, but they are too blunt during stress.

---

## 17. What We Should Say Clearly

These points increase credibility:

- "We are starting with mSOL for focus."
- "The architecture generalizes to additional Solana LSTs."
- "The updater is centralized in the MVP, but the on-chain state format is reusable."
- "The current goal is risk publication on Solana, not full autonomous liquidation control."

These points reduce credibility and should be avoided:

- claiming full decentralization
- claiming direct Kamino integration without actually having it
- claiming broad multi-asset support when only one live asset works

---

## 18. Success Criteria

This plan is successful if, by demo day, we can show:

- an Anchor program deployed on Solana devnet
- an authority-controlled update transaction
- a readable PDA containing current risk state for `mSOL`
- a separate consumer read demonstrating protocol composability
- a clear simulation chart showing why the oracle matters

If those five are working, this is a solid Solana-native funding submission.

---

*Document version: Funding build v2.0*
*Target: Startup funding / Solana co-sponsored judging*
*Primary claim: Solana-native risk oracle for LST collateral*
