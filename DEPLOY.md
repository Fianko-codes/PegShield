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

## Mainnet Deployment

Devnet is the current primary environment. Everything in the previous steps targets devnet. This section documents the path to a **minimal mainnet presence** so the program and one PDA can be read on `mainnet-beta` as a credibility signal ahead of full production rollout.

### What "minimal mainnet" means

One `risk_oracle` program deployed, one `RiskState` PDA initialized for `mSOL-v2`, single-attester mode with the updater keypair as authority, the same GitHub Actions cron updating it. No mainnet multi-attester set, no real lender integration yet — just a reachable mainnet account that lenders can `getAccountInfo` against.

### Costs

| Item | Approx SOL | Why |
|---|---|---|
| Program deploy (one-time) | 3.5–5 SOL | Program binary rent (size-dependent) |
| Each `RiskState` PDA rent-exempt reserve | ~0.002 SOL | Fixed-size account |
| Updater per-tx fees (ongoing) | ~5000 lamports × ~288 tx/day | ~0.0015 SOL/day at 5-min cadence |

Budget: **have 6 SOL funded** before starting, with 2–3 SOL kept as buffer in the updater wallet for ongoing fees.

### Step M1: Fund a mainnet deployer

```bash
solana-keygen new -o ./mainnet-deployer.json   # or reuse an existing funded keypair
solana config set --url mainnet-beta
solana balance -k ./mainnet-deployer.json
```

Do **not** reuse `updater/keypair.json` as the mainnet deployer unless it's already funded and you explicitly want the updater to also own upgrade authority. Separating deployer from updater is safer; you can set upgrade authority after deploy.

### Step M2: Generate a mainnet program keypair

The current `declare_id!("DMR3rXBh…")` in `programs/risk-oracle/src/lib.rs` is the devnet program ID. For mainnet, generate a fresh one to keep environments separated:

```bash
solana-keygen new --no-bip39-passphrase -o ./target/deploy/risk_oracle-mainnet-keypair.json
solana-keygen pubkey ./target/deploy/risk_oracle-mainnet-keypair.json
```

Update `declare_id!(...)` in `programs/risk-oracle/src/lib.rs` **and** in `Anchor.toml` under `[programs.mainnet]`, then rebuild:

```bash
anchor build
```

### Step M3: Deploy

```bash
anchor deploy \
  --provider.cluster mainnet-beta \
  --provider.wallet ./mainnet-deployer.json \
  --program-name risk_oracle \
  --program-keypair ./target/deploy/risk_oracle-mainnet-keypair.json
```

Confirm on the explorer:

```bash
solana program show <MAINNET_PROGRAM_ID> --url mainnet-beta
```

### Step M4: Initialize one `RiskState`

Point `.env.mainnet` at mainnet RPC, the new program ID, and the updater keypair. Then:

```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com \
PROGRAM_ID=<MAINNET_PROGRAM_ID> \
UPDATER_KEYPAIR_PATH=./updater/keypair.json \
npm --prefix cli run start -- init-oracle mSOL-v2
```

Record the resulting PDA. Read it to confirm:

```bash
npm --prefix cli run start -- read mSOL-v2
```

### Step M5: Wire the updater cron

Add mainnet secrets to the GitHub Actions workflow as a separate job (don't replace the devnet job — run both in parallel):

- `SOLANA_MAINNET_RPC_URL`
- `MAINNET_PROGRAM_ID`
- `MAINNET_MSOL_RISK_STATE_PDA`
- reuse `UPDATER_KEYPAIR_JSON` (same keypair, different env)

Use a reputable paid RPC (Helius, Triton, QuickNode) — public mainnet RPCs throttle hard.

### Step M6: Lock down upgrade authority

Once the program is deployed and one PDA is live, decide whether to keep upgrade authority hot, rotate to a multisig, or set it to `None` (immutable). For hackathon credibility, keep it on the deployer keypair so judges see a reachable, working account; document your plan in `docs/MULTI_ATTESTER.md` for rotating to a Squads multisig post-submission.

### Risks to flag to yourself before pressing deploy

- **Program ID divergence**: if you forget to update `declare_id!` and `Anchor.toml`, you'll deploy a program that thinks it's the devnet one. The runtime catches this but you'll waste a deploy.
- **Rent cost**: `anchor deploy` mainnet failures mid-deploy can still debit SOL. Don't deploy with the exact minimum balance; keep headroom.
- **RPC rate limits**: public mainnet RPC will rate-limit `anchor deploy`. Use a dedicated RPC endpoint for the deploy itself.

## Step 9: Final Judge Demo

```bash
time ./demo.sh --dry-run
time ./demo.sh
```

The dry run should complete quickly. The live run depends on network latency and devnet health; record the actual time in [`SUBMISSION.md`](./SUBMISSION.md) before marking the 90-second demo checklist item complete.
