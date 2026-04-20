# PegShield CLI

Unified operator surface for PegShield's on-chain risk oracle.

## Commands

```bash
pegshield init-oracle mSOL-v2
pegshield init-registry --threshold 2 --min-bond-sol 1
pegshield enable-multi mSOL-v2

pegshield register --bond-sol 1.5
pegshield unregister
pegshield withdraw

pegshield submit --payload core-engine/output/latest.mSOL-v2.json
pegshield propose --payload core-engine/output/latest.jitoSOL-v1.json --round 1
pegshield confirm jitoSOL-v1 --round 1
pegshield cancel jitoSOL-v1 --round 1

pegshield read mSOL-v2
pegshield read --all
pegshield registry
pegshield history mSOL-v2 --days 7

pegshield dispute jitoSOL-v1 --round 1 --attester <pubkey> --evidence deadbeef
pegshield resolve jitoSOL-v1 --round 1 --attester <pubkey> --disputer <pubkey>
```

## Environment

The CLI reads the same repo-level `.env` used by the updater scripts:

- `SOLANA_RPC_URL`
- `UPDATER_KEYPAIR_PATH`
- `ORACLE_AUTHORITY` (optional fallback for `init-oracle`)

## Notes

- `submit` keeps the current single-attester operator path intact.
- `propose` / `confirm` / `dispute` / `resolve` drive the multi-attester flow.
- `history` reads committed repo artifacts instead of scraping chain data.
