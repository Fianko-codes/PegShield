# @pegshield/sdk

TypeScript client for the [PegShield](https://github.com/Fianko-codes/PegShield) on-chain LST risk oracle on Solana.

Decodes the `RiskState` PDA into typed, human-readable fields and ships staleness / regime guards so protocols can integrate safely without re-implementing the on-chain layout.

## Install

```bash
npm install @pegshield/sdk @solana/web3.js
```

`@solana/web3.js` is a peer dependency.

## Quick Start

```ts
import { Connection } from "@solana/web3.js";
import {
  fetchRiskState,
  safeLtv,
  isStale,
  isCritical,
} from "@pegshield/sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Defaults to the deployed devnet program + lstId = "mSOL-v2"
const { state, address } = await fetchRiskState(connection);

console.log(`PDA:           ${address.toBase58()}`);
console.log(`suggestedLtv:  ${state.suggestedLtv}`);     // 0.80
console.log(`regimeFlag:    ${state.regimeFlag}`);       // 0 = NORMAL | 1 = CRITICAL
console.log(`theta / sigma: ${state.theta} / ${state.sigma}`);
console.log(`updated:       ${new Date(Number(state.timestamp) * 1000).toISOString()}`);

if (isStale(state) || isCritical(state)) {
  // Fall back to a conservative static LTV — NEVER a higher one
  useLtv(0.4);
} else {
  useLtv(state.suggestedLtv);
}

// Or use the opinionated helper, which bakes in the stale/critical fallback:
const ltv = safeLtv(state, { fallbackLtv: 0.4, maxLtv: 0.85 });
```

## API

### `fetchRiskState(connection, options?)`

Fetches and decodes the on-chain `RiskState` PDA.

```ts
fetchRiskState(connection, {
  lstId?: string;                            // default: "mSOL-v2"
  programId?: string | PublicKey;            // default: deployed devnet program
  commitment?: "processed" | "confirmed" | "finalized";
}): Promise<{ state: RiskState; address: PublicKey; programId: PublicKey }>
```

Throws if the account doesn't exist or is owned by a different program.

### `decodeRiskState(data)`

Pure decoder — takes a `Buffer | Uint8Array` and returns a typed `RiskState`. Use this when you already have the account data (e.g. from a websocket subscription or a batched `getMultipleAccounts`).

### `deriveRiskStatePda({ lstId?, programId? })`

Returns `{ address: PublicKey, bump: number }`. Seeds: `[b"risk", lstId]`.

### Guards

| Function | Returns |
|---|---|
| `isStale(state, nowSec?, maxAgeSec?)` | `true` if `timestamp` older than `MAX_STALENESS_SECS` (default 600) or zero |
| `isCritical(state)` | `true` when `regimeFlag === 1` |
| `safeLtv(state, opts?)` | Opinionated LTV: falls back to `opts.fallbackLtv` (0.40) when stale or CRITICAL, otherwise clamps `suggestedLtv` to `[0, opts.maxLtv]` |

### Constants

```ts
SCALE                     // 1_000_000
MIN_LTV_BPS / MAX_LTV_BPS // 0 / 10_000
MAX_STALENESS_SECS        // 600
MIN_UPDATE_INTERVAL_SECS  // 30
DEFAULT_PROGRAM_ID        // "DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea"
DEFAULT_LST_ID            // "mSOL-v2"
RISK_STATE_SEED           // "risk"
```

### IDL

The Anchor IDL is bundled and re-exported for consumers who want to spin up a `Program` for writes (most will only read):

```ts
import { RISK_ORACLE_IDL } from "@pegshield/sdk";
// or
import RISK_ORACLE_IDL from "@pegshield/sdk/idl";
```

## `RiskState` Shape

| Field | Type | Notes |
|---|---|---|
| `lstId` | `string` | e.g. `"mSOL-v2"` |
| `theta` | `number` | θ — mean-reversion speed |
| `sigma` | `number` | σ — volatility |
| `zScore` | `number` | signed z-score of current spread |
| `suggestedLtv` | `number` | `[0, 1]` float |
| `thetaScaled` / `sigmaScaled` / `zScoreScaled` | `bigint` | raw on-chain × `SCALE` |
| `suggestedLtvBps` | `number` | basis points, 0–10,000 |
| `regimeFlag` | `0 \| 1` | 1 = CRITICAL |
| `slot` | `bigint` | Solana slot of last update |
| `timestamp` | `bigint` | unix seconds of last update, `0n` if never written |
| `authority` | `string` | base58 pubkey allowed to update |
| `lastUpdater` | `string` | base58 pubkey of most recent submitter |

## Consumer Safety Checklist

Before authorising any borrow against PegShield's `suggestedLtv`:

1. **Check staleness.** `isStale(state)` must be `false`.
2. **Check regime.** Consider gating new loans entirely when `regimeFlag === 1`.
3. **Apply your own cap.** Even with `MAX_LTV_BPS = 10_000`, clamp to your protocol-side ceiling.
4. **Define a fallback.** Stale / CRITICAL / RPC-failure → fall back to a conservative static LTV, **never a higher one**.

See [`SECURITY.md`](https://github.com/Fianko-codes/PegShield/blob/main/SECURITY.md) in the main repo for the full trust model and known limitations.

## License

Apache-2.0
