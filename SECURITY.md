# Security

PegShield is a devnet-stage risk oracle. It is explicitly **not** audited or production-ready. This document describes the trust model, known limitations, and how to report issues.

## Reporting a Vulnerability

Use GitHub's private vulnerability reporting:

> **Repo → Security → "Report a vulnerability"**
> (https://github.com/Fianko-codes/PegShield/security/advisories/new)

Please do **not** file public issues or PRs for security-sensitive findings. Expected acknowledgement: within 72 hours. Please include:

- Affected component (`solana-program`, `updater`, `bridge`, `core-engine`, `dashboard`, CI)
- Reproduction steps, expected vs. observed behaviour
- Impact (funds-at-risk, data-integrity, DoS, information-disclosure, etc.)
- Suggested fix, if any

## Scope

### In scope

- Anchor program source in `solana-program/programs/risk-oracle/`
- IDL in `solana-program/idl/risk_oracle.json`
- Updater scripts in `updater/`
- Statistical engine in `core-engine/` (calibration / LTV bounds that could be exploited)
- CI workflow `.github/workflows/oracle-updater.yml`
- Read-only dashboard API in `dashboard/api/`

### Out of scope

- Issues affecting only devnet liveness (we control devnet deployment, anyone can halt it)
- Vulnerabilities in upstream dependencies already tracked by advisories (please still flag them)
- Front-running of the devnet PDA (single-authority signer; see trust model below)
- Anything requiring an already-compromised updater keypair

## Trust Model (current)

PegShield is **centralised by design** at this stage:

| Component | Trust assumption |
|---|---|
| Price data | Pyth Hermes is honest and timely. No cross-check against secondary oracle. |
| Reference rate | Fetched from the LST's canonical source (`Marinade` API for `mSOL`, `Jito` Kobe API for `jitoSOL`); fallback constants are used if unreachable. A compromised reference-rate API could skew peg_deviation. |
| Updater | **One** keypair (`ORACLE_AUTHORITY`) controls all writes. Anyone with that keypair can push arbitrary risk values (within clamped ranges). |
| Program upgrade | Upgrade authority is the deployer's keypair. Program is not currently marked immutable. |
| Consumer | Consumers are expected to check `timestamp` freshness (see staleness below). |

Consumers should treat the PDA as a single-signer signal until a multi-attester scheme lands (roadmap).

## On-chain Safety Properties

The Anchor program enforces the following on every `update_risk_state`:

| Property | Where |
|---|---|
| `authority` signer matches stored `RiskState.authority` | `has_one = authority` |
| `params.lst_id` matches stored `lst_id` | `require!(state.lst_id == params.lst_id, LstIdMismatch)` |
| `theta_scaled ≥ 0` | `require!(params.theta_scaled >= 0, InvalidRiskParams)` |
| `sigma_scaled > 0` | `require!(params.sigma_scaled > 0, InvalidRiskParams)` |
| `suggested_ltv_bps ∈ [MIN_LTV_BPS, MAX_LTV_BPS]` | checked against constants |
| Update throttled — ≥ 30 s since last | `UpdateTooFrequent` |
| `close_oracle` requires authority signer | `has_one = authority` |

No floating-point math executes on-chain; all risk fields are encoded as scaled `i64` / `u16` basis points.

## Consumer Responsibilities

A lending protocol consuming the PDA **must**:

1. **Check freshness.** Reject `timestamp` older than your safety window. The reference `updater/consumer_demo.ts` uses `MAX_STALENESS_SECS = 600`.
2. **Verify `regime_flag`.** `CRITICAL` means the model has detected non-stationarity + extreme z-score; consider gating new loans entirely.
3. **Do not rehydrate floats blindly.** Always divide scaled integers by the documented `SCALE = 1_000_000`; treat `suggested_ltv_bps` as basis points, not a float.
4. **Clamp defensively.** Even if the on-chain program enforces `[MIN_LTV_BPS, MAX_LTV_BPS]`, apply your own protocol-side cap.
5. **Fallback plan.** Define behaviour when the PDA is stale, `regime_flag=1`, or the Solana RPC is unreachable. A sane default is: fall back to a conservative static LTV, not to a higher one.

## Keypair Handling

- `updater/keypair.json` is **never** committed (enforced by `.gitignore`).
- In CI, the keypair is injected via the `UPDATER_KEYPAIR_JSON` repository secret and written to a temp path for the run.
- The authority keypair has *only* the rights granted by `has_one = authority` on `RiskState`. It is **not** the program upgrade authority.
- Losing the updater keypair means the PDA becomes unupdatable but funds are not at risk because the program holds no funds. Recovery path: redeploy with a new lst_id (same flow used for layout migrations; see `updater/close.ts`).

## Known Limitations

Disclosed proactively so consumers don't take on hidden risk:

- **Single attester.** No multi-signer or threshold scheme yet. A compromised `ORACLE_AUTHORITY` keypair can push any values within clamped ranges.
- **No secondary price cross-check.** If Pyth publishes a bad price, PegShield will propagate it.
- **Reference-rate API dependency.** If the configured LST's canonical rate endpoint is unreachable, the bridge falls back to a hardcoded rate. This is flagged in the snapshot as `reference_rate_source: "fallback-hardcoded"`, but consumers should watch for it.
- **Short calibration window.** The rolling OU window is bootstrapped; during the first few updates, `theta`/`sigma` estimates will be noisy.
- **Devnet-only.** No mainnet deployment. Assume all funds and state are disposable.
- **Limited live deployment scope.** The codebase now supports `mSOL-v2` and `jitoSOL-v1`, but only the `mSOL-v2` devnet PDA is live by default. Each new LST still needs its own PDA, updater run, and calibration review.
- **Upgrade authority.** The program is upgrade-mutable. A future release will mark it immutable after a stable mainnet deployment.

## Roadmap to "Production-Grade"

1. Multi-attester scheme (threshold-signed updates)
2. Secondary oracle cross-check (Switchboard / Chainlink delta)
3. On-chain confidence intervals (widen LTV band when Pyth confidence is high)
4. Formal verification of the LTV clamp logic
5. Mainnet deployment + immutable upgrade authority
6. Published consumer SDK with type-safe deserialisation + staleness guards

## Responsible Disclosure Acknowledgements

This section will credit reporters who responsibly disclose verified issues.
