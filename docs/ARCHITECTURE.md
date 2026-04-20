# Architecture

End-to-end view of how a Pyth tick becomes an on-chain LTV that a Solana lending protocol can read. Pairs with [`README.md`](../README.md) (overview), [`SECURITY.md`](../SECURITY.md) (trust model), and [`MULTI_ATTESTER.md`](./MULTI_ATTESTER.md) (decentralization roadmap).

## Architecture At A Glance

| Question | Short answer |
|---|---|
| What enters the system? | Pyth LST/SOL prices plus the LST's canonical staking exchange rate |
| What is computed off-chain? | peg deviation, OU parameters, stationarity, regime, suggested LTV |
| What is committed on-chain? | compact `RiskState` with freshness and suggested LTV |
| What do consumers read? | one PDA per `lst_id` |
| What happens on failure? | lenders are expected to tighten or halt via conservative fallback logic |

## System Diagram

```
                ┌──────────────────────────────────────────────────────────────┐
                │                       OFF-CHAIN PIPELINE                      │
                │                                                               │
   ┌─────────┐  │  ┌──────────┐   ┌────────────────┐   ┌────────────────────┐  │   ┌──────────────┐
   │  Pyth   │──┼─▶│  bridge  │──▶│  core-engine   │──▶│      updater       │──┼──▶│ Solana PDA   │
   │ Hermes  │  │  │ fetch +  │   │  OU + ADF +    │   │ Anchor TX (signed) │  │   │ RiskState    │
   │ (LST,   │  │  │ peg calc │   │  z-score +     │   │ rate-limited 30 s  │  │   │ (lst_id)     │
   │  SOL)   │  │  └────┬─────┘   │  LTV mapper    │   └─────────┬──────────┘  │   └──────┬───────┘
   └─────────┘  │       │         └────────┬───────┘             │             │          │
                │       ▼                  ▼                     ▼             │          ▼
                │  ┌────────────┐    ┌──────────┐         ┌────────────┐       │   ┌──────────────┐
                │  │ Marinade / │    │ pipeline │         │ submit_    │       │   │ @pegshield/  │
                │  │ Jito ref.  │    │  .json   │         │ update.ts  │       │   │ sdk reads    │
                │  │   rates    │    │ artifact │         │            │       │   │ + guards     │
                │  └────────────┘    └──────────┘         └────────────┘       │   └──────┬───────┘
                │                                                               │          │
                │  ┌──────────────────────────────────────────────────────────┐ │          ▼
                │  │ GitHub Actions cron (oracle-updater.yml, every 5 min)    │ │   ┌──────────────┐
                │  │ runs the bridge → engine → updater chain end-to-end      │ │   │ Lending      │
                │  └──────────────────────────────────────────────────────────┘ │   │ protocol     │
                │                                                               │   │ borrow gate  │
                └──────────────────────────────────────────────────────────────┘   └──────────────┘
                                                                                          │
                                                                                          ▼
                                                                                   ┌──────────────┐
                                                                                   │  Consumers    │
                                                                                   │  / operators  │
                                                                                   └──────────────┘
```

## Components

| Component | Path | Responsibility |
|---|---|---|
| Bridge | [`bridge/`](../bridge) | Pull LST and SOL prices from Pyth Hermes, fetch the protocol reference rate (Marinade for `mSOL-v2`, Jito stake-pool stats for `jitoSOL-v1`), compute `peg_deviation`, write `bridge/data/latest.json` |
| Core engine | [`core-engine/`](../core-engine) | Maintain a rolling peg-deviation window, fit the OU process (`θ`, `μ`, `σ`), run ADF stationarity, compute `z_score`, map regime → suggested LTV |
| Updater | [`updater/`](../updater) | Anchor client that submits `update_risk_state(theta, sigma, z_score, ltv_bps, regime, lst_id)` signed by the authority keypair |
| On-chain program | [`solana-program/`](../solana-program) | `risk_oracle` Anchor program: PDA seeded `["risk", lst_id]`, fixed-point `i64` storage, 30 s rate limit, `has_one = authority` on writes and `close_oracle` |
| SDK | [`sdk/`](../sdk) | `@pegshield/sdk` typed client + guards (`isStale`, `isCritical`, `safeLtv`) — what consumers depend on |
| Artifact sync | [`scripts/sync_artifacts.py`](../scripts/sync_artifacts.py) | Serializes trusted oracle snapshots, bridge caches, and the scenario bundle into `artifacts/` |
| Updater CI | [`.github/workflows/oracle-updater.yml`](../.github/workflows/oracle-updater.yml) | Scheduled cron that reproduces the full local flow, persists bridge caches, and commits fresh oracle artifacts |
| Simulation | [`simulation/`](../simulation) | Replays the June-2022 stETH/ETH depeg through both the live oracle policy and a fixed-LTV baseline; reports bad-debt deltas |

## Update Sequence (Steady State)

```
GitHub Actions    bridge/fetch_pyth.py     core-engine/pipeline.py     updater/submit_update.ts     RiskState PDA
     │                    │                          │                           │                       │
     │── trigger (cron) ─▶│                          │                           │                       │
     │                    │── GET Hermes + ref-rate ▶│                           │                       │
     │                    │◀──── prices, rate ──────│                           │                       │
     │                    │── write latest.json ────▶│                           │                       │
     │                    │                          │── fit OU, ADF, z, LTV ──▶│                       │
     │                    │                          │── write pipeline.json ──▶│                       │
     │                    │                          │                           │── update_risk_state ─▶│
     │                    │                          │                           │◀── tx signature ─────│
     │── commit artifacts ◀┼─────────────────────────┼───────────────────────────┘                       │
     │                    │                          │                                                   │
     ▼                    ▼                          ▼                                                   ▼
 repo cache refreshes                                                                     consumers fetch & guard
```

## Figure: Trust Boundary Map

```text
market data ──► bridge ──► engine ──► updater signer ──► on-chain PDA ──► lender
    │             │          │             │                 │              │
    │             │          │             │                 │              │
 external      parsing    calibration   operational      canonical       protocol-
 trust         + sanity   correctness   key custody      account         side guard
 source        checks                                   ownership        enforcement
```

## Consumer Read Path

```
Lending protocol
      │
      │ (1) deriveRiskStatePda({ lstId })       seeds = ["risk", lst_id]
      │ (2) connection.getAccountInfo(pda)
      │ (3) decodeRiskState(buffer)             SDK pure decoder
      │ (4) isStale / isCritical / safeLtv      SDK guards
      ▼
   useLtv(safeLtv(state, { fallbackLtv: 0.4, maxLtv: 0.85 }))
```

If staleness > `MAX_STALENESS_SECS` (600s), or `regimeFlag === 1`, or any RPC failure occurs, the consumer falls back to a conservative static LTV — never a higher one. See [`sdk/README.md`](../sdk/README.md#consumer-safety-checklist).

## Trust Boundaries

| Boundary | Trust assumption today | How it's enforced |
|---|---|---|
| Pyth → bridge | Pyth Hermes price feed honesty | Single dependency; `bridge/fetch_pyth.py` rejects stale or zero prices |
| Bridge → engine | Local I/O integrity | Engine recomputes from raw `latest.json` each run; no side state |
| Engine → updater | The off-chain pipeline is correct | Oracle artifacts and bridge caches are committed back to git so any reviewer can replay |
| Updater → PDA | Single authority keypair signs | `has_one = authority` on the Anchor account; `MIN_UPDATE_INTERVAL_SECS = 30` rate limits |
| PDA → consumer | On-chain account is canonical | Account is owned by `DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea`; SDK rejects accounts owned by anything else |

The single-attester model is the dominant trust assumption today and is the explicit subject of [`MULTI_ATTESTER.md`](./MULTI_ATTESTER.md).

## Data Contracts

### `peg_deviation`

```
peg_deviation = (asset_usd / sol_usd) / reference_rate − 1
```

- `asset_usd`, `sol_usd` come from Pyth Hermes
- `reference_rate` is the protocol's canonical staking exchange rate (Marinade or Jito), not a market quote
- Healthy peg → near 0 and mean-reverting; real depeg → meaningfully negative

### `RiskState` (on-chain, fixed point)

| Field | Type | Scaling |
|---|---|---|
| `theta_scaled`, `sigma_scaled`, `z_score_scaled` | `i64` | × `SCALE` (`1_000_000`) |
| `suggested_ltv_bps` | `u16` | basis points 0–10000 |
| `regime_flag` | `u8` | `0 = NORMAL`, `1 = CRITICAL` |
| `slot`, `timestamp` | `u64`, `i64` | Solana slot + unix seconds |
| `authority`, `last_updater` | `Pubkey` | gate writes / observability |

The SDK's `RiskState` view exposes both the raw scaled `bigint`s and decoded floats so consumers can choose the precision they need.

## Failure Modes & What Happens

| Failure | Detected by | Behavior |
|---|---|---|
| Pyth feed unavailable | Bridge | Cron job fails loudly; PDA simply isn't updated; consumers see staleness rising |
| Reference rate API unavailable | Bridge | Same as above; we never substitute a stale rate silently |
| Updater keypair unavailable | Updater | Submission fails; PDA stale; consumers fall back to conservative LTV |
| Authority key compromised | — | Out of scope for v1; mitigation is the multi-attester roadmap |
| Consumer skips guards | Consumer | Their own bad-debt risk; documented loudly in `sdk/README.md` |

## Where To Read Next

- [`README.md`](../README.md) — overview, live deployment, run commands
- [`sdk/README.md`](../sdk/README.md) — full consumer API + safety checklist
- [`docs/INTEGRATION.md`](./INTEGRATION.md) — step-by-step lender integration walkthrough
- [`SECURITY.md`](../SECURITY.md) — trust model and known limitations
- [`docs/MULTI_ATTESTER.md`](./MULTI_ATTESTER.md) — decentralization design
