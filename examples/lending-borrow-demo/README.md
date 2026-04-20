# Lending Borrow Demo

Reference consumer for PegShield. This simulates how a lending protocol would turn the on-chain oracle state into a borrow decision for LST collateral.

## What It Shows

- Reads the live PegShield PDA from Solana devnet by default
- Compares a naive static `80%` collateral policy against `safeLtv()` from `@pegshield/sdk`
- Prints freshness, regime, and the operational action a protocol should take

## Run

```bash
npm install
npm run start -- 100 1814.63 stETH
```

Arguments are:

- `collateral_units` (default `100`)
- `unit_price_usd` (default `1814.63`)
- `symbol` (default `stETH`)

## Offline Verification

Use the repo snapshot if you want deterministic local output without a live RPC call:

```bash
npm run start:snapshot -- 100 1814.63 stETH
```

This mode reads `artifacts/oracle_state.json`, maps it into the SDK state shape, and runs the same lending decision logic.
