# PegShield Deployment Runbook

This runbook describes PegShield's current devnet-stage Anchor deployment workflow.

## Scope

Use this for:

- deploying or upgrading `risk_oracle`
- deploying or upgrading `mock_lender`
- initializing one or more `RiskState` PDAs
- enabling multi-attester mode for an initialized oracle
- proving the deployed state with CLI reads and artifacts

## Prerequisites

- Solana CLI installed and on `PATH`
- Anchor `0.31.1`
- Node `20+`
- Python virtualenv initialized with `requirements.txt`
- A funded deployer/updater keypair
- `.env` created from [`.env.example`](./.env.example)

Install local dependencies:

```bash
make install
```

## Configuration

Important values:

| Variable | Meaning |
|---|---|
| `PROGRAM_ID` | PegShield `risk_oracle` program id |
| `SOLANA_RPC_URL` | target cluster RPC, currently devnet |
| `UPDATER_KEYPAIR_PATH` | signer used by updater/CLI scripts |
| `ORACLE_AUTHORITY` | authority stored in `RiskState` for single-attester mode |
| `MSOL_RISK_STATE_PDA` | optional known PDA for `mSOL-v2` |
| `JITOSOL_RISK_STATE_PDA` | optional known PDA for `jitoSOL-v1` |
| `BSOL_RISK_STATE_PDA` | optional known PDA for `bSOL-v1` |

The current devnet program id in code is:

```text
DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea
```

## Step 1: Preflight

Run the deterministic local checks first:

```bash
make verify-offline
```

Then inspect pending changes:

```bash
git status --short
git diff --stat
```

Do not deploy with unreviewed source changes or local secrets staged.

## Step 2: Build Programs

```bash
cd solana-program
anchor build
```

Confirm that both binaries exist:

```bash
ls -lh target/deploy/risk_oracle.so target/deploy/mock_lender.so
```

## Step 3: Confirm Wallet And Balance

```bash
solana config set --url devnet
solana address -k ../updater/keypair.json
solana balance -k ../updater/keypair.json --url devnet
```

If the balance is low on devnet:

```bash
solana airdrop 2 "$(solana address -k ../updater/keypair.json)" --url devnet
```

## Step 4: Deploy Or Upgrade

From `solana-program/`:

```bash
anchor deploy --provider.cluster devnet --provider.wallet ../updater/keypair.json
```

If `anchor deploy` fails while upgrading `risk_oracle`, check:

- deployer wallet balance
- whether the configured program id matches `target/deploy/risk_oracle-keypair.json`
- whether the program upgrade authority is the wallet you are using
- whether devnet RPC rate limits interrupted the upgrade

## Step 5: Initialize Oracle State

Initialize each LST that should be live:

```bash
npm --prefix cli run start -- init-oracle mSOL-v2
npm --prefix cli run start -- init-oracle jitoSOL-v1
npm --prefix cli run start -- init-oracle bSOL-v1
```

If a PDA already exists, this command should fail harmlessly. Use `read` to inspect it instead.

## Step 6: Initialize Multi-Attester Registry

```bash
npm --prefix cli run start -- init-registry --threshold 2 --min-bond-sol 1
npm --prefix cli run start -- enable-multi mSOL-v2
```

Register attesters:

```bash
npm --prefix cli run start -- register --bond-sol 1
```

## Step 7: Submit And Verify State

Generate fresh data and submit:

```bash
.venv/bin/python bridge/fetch_pyth.py --asset mSOL --lst-id mSOL-v2 --output bridge/data/latest_raw.mSOL-v2.json
.venv/bin/python core-engine/pipeline.py --input bridge/data/latest_raw.mSOL-v2.json --output core-engine/output/latest.mSOL-v2.json
npm --prefix updater run submit -- core-engine/output/latest.mSOL-v2.json
```

Read back:

```bash
npm --prefix cli run start -- read mSOL-v2
npm --prefix cli run start -- status mSOL-v2
```

## Step 8: Refresh Evidence Artifacts

```bash
make artifacts
git status --short artifacts simulation/charts
```

Commit only the intended artifact updates. Do not commit `.env`, keypairs, raw bridge working files, or generated `dist/` folders.

## Step 9: Final Judge Demo

```bash
time ./demo.sh --dry-run
time ./demo.sh
```

The dry run should complete quickly. The live run depends on network latency and devnet health; record the actual time in [`SUBMISSION.md`](./SUBMISSION.md) before marking the 90-second demo checklist item complete.
