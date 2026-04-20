# Lender Integration Guide

How a Solana lending protocol integrates the PegShield risk oracle as the LTV source for LST collateral. Bridges the high-level [`README.md`](../README.md), the API reference in [`sdk/README.md`](../sdk/README.md), and the runnable [`examples/lending-borrow-demo`](../examples/lending-borrow-demo).

> **TL;DR** — install `@pegshield/sdk`, derive the PDA with the LST id you support, decode `RiskState`, gate borrows behind `safeLtv()`. If anything goes wrong, fall back to a conservative static LTV — never a higher one.

## Integration Checklist

| Step | Required | Why |
|---|---|---|
| Read PDA | yes | oracle state must come from the on-chain account |
| Verify owner / decode safely | yes | reject spoofed accounts |
| Check freshness | yes | stale risk state must not loosen lending |
| Check `regime_flag` | yes | critical regime should tighten or halt |
| Clamp protocol-side max LTV | yes | your protocol keeps final authority |
| Define conservative fallback LTV | yes | failures should reduce risk, not increase it |

## When To Use This Guide

You're building (or operating) a lending market that accepts an LST — `mSOL`, `jitoSOL`, etc. — as collateral and you want a per-asset LTV that responds to peg risk in real time instead of a static collateral factor that you only revise during weekend governance calls.

If you only need a *price* for the LST, use a price oracle. PegShield is complementary — it tells you how *safe* that collateral is right now.

## Prerequisites

| Need | Detail |
|---|---|
| Network | Solana devnet today; mainnet is roadmap |
| Asset | `mSOL-v2` is live; `jitoSOL-v1` is wired and will be live once its PDA is initialized |
| Runtime | Node 18+ for the SDK |
| RPC | Any Solana RPC; use a paid endpoint in production |
| Trust | Read [`SECURITY.md`](../SECURITY.md) — single-attester v1 |

## Install

```bash
npm install @pegshield/sdk @solana/web3.js
```

`@solana/web3.js` is a peer dependency.

## Step 1 — Read the PDA

```ts
import { Connection } from "@solana/web3.js";
import { fetchRiskState } from "@pegshield/sdk";

const connection = new Connection(process.env.SOLANA_RPC_URL!, "confirmed");

// Defaults: deployed devnet program, lstId = "mSOL-v2"
const { state, address } = await fetchRiskState(connection);
```

For a different LST, pass `lstId`:

```ts
const { state } = await fetchRiskState(connection, { lstId: "jitoSOL-v1" });
```

If you already have the account data (`getMultipleAccounts`, websocket subscription), use the pure decoder:

```ts
import { decodeRiskState, deriveRiskStatePda } from "@pegshield/sdk";

const { address } = deriveRiskStatePda({ lstId: "mSOL-v2" });
const account = await connection.getAccountInfo(address);
const state = decodeRiskState(account!.data);
```

## Step 2 — Apply the safety guards

This is the integration. Don't skip it.

```ts
import { isStale, isCritical, safeLtv } from "@pegshield/sdk";

if (isStale(state) || isCritical(state)) {
  // Conservative static fallback — NEVER higher than your normal LTV
  return useLtv(0.40);
}
return useLtv(state.suggestedLtv);
```

Or use the opinionated helper that bakes in the fallback and a max cap:

```ts
const ltv = safeLtv(state, { fallbackLtv: 0.40, maxLtv: 0.85 });
```

`safeLtv` returns `fallbackLtv` when `isStale(state) || isCritical(state)`, and otherwise clamps `state.suggestedLtv` to `[0, maxLtv]`.

## Figure: Borrow Decision Logic

```text
RiskState read
    │
    ├── stale? ───────────────► use fallbackLtv
    │
    ├── critical regime? ─────► use fallbackLtv or halt new borrows
    │
    ├── bad owner / decode? ──► use fallbackLtv
    │
    └── otherwise ────────────► clamp suggestedLtv to your protocol cap
```

## Step 3 — Decide

Map the resolved LTV into your lending logic:

```ts
function maxBorrowUsd(collateralUsd: number, state: RiskState) {
  const ltv = safeLtv(state, { fallbackLtv: 0.40, maxLtv: 0.85 });
  return collateralUsd * ltv;
}
```

The reference [`examples/lending-borrow-demo`](../examples/lending-borrow-demo) prints the live oracle decision next to a naive fixed-80% baseline so you can see the difference on real data:

```bash
cd examples/lending-borrow-demo
npm install
npm run start -- 100 1814.63 stETH       # live devnet read
npm run start:snapshot -- 100 1814.63 stETH  # offline, uses repo snapshot
```

## Step 4 — Treat failure as the common case

| Failure | What you do |
|---|---|
| RPC times out | Catch and fall back to your conservative static LTV |
| `fetchRiskState` throws (account missing / wrong owner) | Same |
| `isStale(state) === true` (`timestamp === 0n` or > `MAX_STALENESS_SECS`) | Fallback |
| `isCritical(state)` | Fallback (and consider gating *new* loans entirely) |
| `state.suggestedLtv` higher than your protocol's risk ceiling | Always clamp to your own cap; `safeLtv` does this if you pass `maxLtv` |

The contract is asymmetric: a stale or unknown oracle should *tighten* lending, never loosen it.

## Step 5 — Operationalize

| Concern | Recommendation |
|---|---|
| Refresh cadence | The PDA is updated every ~5 min by CI. Cache the read for 5–30 s; subscribe via websocket if you want push updates |
| Monitoring | Alert when `timestamp` hasn't advanced in > 10 min, or when `regimeFlag === 1` for > N consecutive reads |
| Fallback policy | Document your conservative static LTV per asset and review it quarterly |
| Per-asset config | Maintain a map `lstId → { fallbackLtv, maxLtv }` rather than hard-coding |
| Governance | When PegShield raises `suggestedLtv`, you accept it; when it lowers it, you accept it. The whole point is to take the human out of the tighten loop |

## Reading the on-chain account directly (Rust / Anchor)

If you'd rather decode in your own Anchor program instead of going through the SDK, the layout is fixed and stable:

| Offset (bytes) | Field | Type |
|---|---|---|
| 0 | discriminator | `[u8; 8]` (Anchor) |
| 8 | `lst_id` | `String` (length-prefixed) |
| variable | `theta_scaled` | `i64` |
| variable | `sigma_scaled` | `i64` |
| variable | `z_score_scaled` | `i64` |
| variable | `suggested_ltv_bps` | `u16` |
| variable | `regime_flag` | `u8` |
| variable | `slot` | `u64` |
| variable | `timestamp` | `i64` |
| variable | `authority` | `Pubkey` |
| variable | `last_updater` | `Pubkey` |

PDA seeds: `[b"risk", lst_id.as_bytes()]`. Owner: `DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea`.

Reject the account if the owner doesn't match.

## End-to-End Verification

Before you ship, replay a stress event end-to-end against your integration:

```bash
.venv/bin/python simulation/stress_test.py
```

This replays the June 2022 stETH/ETH depeg through both the live oracle policy and a fixed-LTV baseline and writes `simulation/charts/stress_scenario.{csv,png,meta.json}`. Compare `shortfall_dynamic` vs `shortfall_static` to see the bad-debt delta on real historical data.

## Going to mainnet

Today the deployment is devnet only. When you're ready to consume on mainnet, you'll need:

1. A mainnet program deployment + `RiskState` PDA per LST you support
2. A production updater authority (with the ops story from [`docs/MULTI_ATTESTER.md`](./MULTI_ATTESTER.md))
3. Your own tightened fallbacks — mainnet bad debt is real money

Track that work via the project's GitHub issues.

## Where To Read Next

- [`sdk/README.md`](../sdk/README.md) — full API reference
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — system diagram + data contracts
- [`SECURITY.md`](../SECURITY.md) — trust model & disclosure
- [`docs/MULTI_ATTESTER.md`](./MULTI_ATTESTER.md) — decentralization roadmap
- [`examples/lending-borrow-demo`](../examples/lending-borrow-demo) — runnable reference consumer
