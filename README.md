# Solana LST Risk Oracle

Solana-native risk oracle MVP for LST collateral, starting with `mSOL`.

## Current Scope

- Anchor program for on-chain risk state
- TypeScript updater and read client
- Pyth fetch bridge scaffold
- Simulation scaffold
- Core risk model intentionally deferred

## Repository Layout

```text
bridge/          Pyth fetch utilities
core-engine/     Placeholder model modules
solana-program/  Anchor workspace
updater/         Transaction submit/read scripts
simulation/      Stress replay and plotting shells
```

## Next Build Order

1. Finish and validate the Anchor program locally
2. Wire updater scripts to the deployed program
3. Add live price fetching
4. Add the risk engine
5. Add stress simulation outputs
