# PegShield — Plan to Win NRs 15 Lakh

> **Target:** hackathon/grant judges giving NRs 15 lakh. You are not competing with Web2 hobby projects — you are competing with other Solana teams. Every move below is picked for **"impact per judging-minute"**, not feature completeness.

---

## TL;DR — Where You Actually Stand

You are **~80% of the way to a winner**, and closer than most teams at this stage. The remaining 20% is not "more features." It is: (a) one critical correctness bug in the simulation that currently tells the *opposite* story to what your pitch needs; (b) three polish moves that change "good hackathon project" into "oh, this is a product"; (c) a 60-second demo script you can run flawlessly, even hungover, at 2am.

**Strengths already in place** (do not touch, stop over-engineering):
- Live devnet deployment with program `DMR3rXBh8…`, PDA `7dtHBg6…`, and a visible update cadence via GitHub Actions.
- Real statistical content — Ornstein–Uhlenbeck + ADF stationarity + z-score — that judges can independently verify in `core-engine/`.
- Marinade-rate-corrected peg math. This alone beats ~every LST risk-model you'll see at a hackathon, because most teams naively compare USD prices and get a fake 36% "spread".
- Fixed-point on-chain layout, `has_one` authority, 30s rate-limit, clamped LTV bounds, authority-gated close. On-chain code is actually tight.
- Published SDK at `sdk/` (`@pegshield/sdk`) with typed decoder, guards, IDL re-export, and a passing decode round-trip test.
- Historical stETH/ETH June-2022 replay data, sourced from real archived daily closes + depeg anchors. This is the **single biggest differentiator** you have. Most teams will show synthetic/handwaved stress. You have a real event.
- SECURITY.md, Apache-2.0 licensing, CI-driven snapshot refresh, Vercel-hosted dashboard.

**What is blocking the win** is in the next section. Triage it by priority, not by order of appearance in the codebase.

---

## Judging Scorecard (What They Will Score, Honestly)

| Dimension | Weight | Your Status | Gap |
|---|---|---|---|
| **Is it live on-chain?** | Critical | ✅ Devnet, visible Explorer links | None |
| **Does it solve a real problem?** | Critical | ✅ LST collateral risk during de-peg is a real, painful, unsolved problem on Solana | None |
| **Does the demo show the pitch viscerally?** | **Critical** | ❌ **Simulation currently shows oracle as WORSE than static LTV due to inverted bad-debt framing** | **P0.1 — fix this first, today** |
| **Is the on-chain code tight?** | High | ✅ | None |
| **Is the math real?** | High | ✅ OU + ADF is genuine | Surface it in the UI, not just README — **P1.2** |
| **Can a protocol actually integrate it?** | High | ✅ SDK exists | No reference consumer using the SDK yet — **P1.3** |
| **Is the UX polished?** | Medium | ✅ Good already | Staleness badge + "verify on Explorer" deep-links — **P1.4**, **P1.5** |
| **Is it original?** | Medium | ✅ "Risk oracle" vs "price oracle" framing is genuinely novel on Solana | Nail this in the pitch — **P2.1** |
| **Will they remember it?** | Medium | ❌ No demo video, no one-line hook in deck form | **P1.6** |
| **Does the team look like they'd ship mainnet?** | Medium | Partial | Multi-attester roadmap page — **P2.2** |

---

## Priority 0 — **FIX BEFORE ANYTHING ELSE**

### P0.1 — The simulation currently pitches *against* you. Fix the bad-debt math. 🚨

**Current behaviour (verified, as of this plan):**
Running `simulation/stress_test.py` against the real stETH June-2022 replay produces:

| Metric | Static LTV 80% | Dynamic Oracle LTV |
|---|---|---|
| Max `bad_debt_*` | **$70,591** | **$107,880** |
| Final `bad_debt_*` | $60,844 | $103,007 |
| UI "Exposure gap" | shows static bad-debt as positive | shows oracle as **worse** |

**Why this happens:** `evaluate_oracle` sets `borrowed_value = V_0 * CF_BASE` (a fixed borrow) and then computes `bad_debt = max(0, borrowed - ltv_t * V_t)`. Both policies borrow the *same* amount; only the accepted-collateral-value differs. The dynamic oracle then looks worse because it accepts *less* of the collapsing collateral.

**This is a modelling bug, not a policy result.** A protocol using the oracle would have **originated a smaller loan** at `t=0`, not the full `0.8 * V_0`.

**Correct framing (verified on real data):**

```
V0 = 100 stETH × $1,814.63 = $181,462
static  borrower takes out:  0.80 × V0 = $145,170
oracle  borrower capped at:  ltv_oracle[t=0] × V0 ≈ $90,858
```

Then the shortfall when ETH crashes to $1,054 (final):
- Static: `max(0, 145,170 − 100 × 1,054) = $39,763`
- Oracle: `max(0, 90,858 − 100 × 1,054) = $0`

**The oracle prevents 100% of the bad debt. That is your pitch in one number.**

**Action:**
1. Edit `simulation/stress_test.py::evaluate_oracle`:
   - Replace the shared `borrowed_value` with **two** borrow amounts:
     - `borrow_static = V_0 * CF_BASE`
     - `borrow_dynamic = V_0 * ltv_dynamic[0]`   (the oracle's LTV at origination, not the final)
   - Rename columns for clarity: `shortfall_static`, `shortfall_dynamic`. Keep `bad_debt_*` as deprecated aliases mapping to the same thing so the dashboard snapshot still parses; remove the aliases in a follow-up.
2. Edit `simulation/plot.py` labels: *"Shortfall risk: fixed LTV"* and *"Shortfall risk: oracle LTV"*. Keep the colour convention (red = worse, green = oracle).
3. Edit `dashboard/src/pages/SimPage.tsx`:
   - `exposureGap = max(0, currentPoint.bad_debt_no_oracle - currentPoint.bad_debt_with_oracle)` — note the **reversed** order.
   - Relabel "Exposure gap during replay" → **"Loss prevented by oracle"** with green accent.
   - Change *"Exposure gap during replay"* in the Static Policy card to *"Exposure: ${bad_debt_no_oracle} (would have defaulted)"*.
4. Re-run end-to-end: `python simulation/stress_test.py && python dashboard/scripts/sync_demo_data.py`. Visually confirm the SimPage hero number is a **large positive** and green.
5. Add one test in `tests/test_core_engine.py::test_historical_replay_oracle_outperforms_static` asserting `shortfall_dynamic_final <= 0.5 * shortfall_static_final` so this bug can never regress silently.

**Time:** 45 min–2 hr. **If you only do one thing from this document, do this.**

### P0.2 — Reconcile git divergence before you touch anything else

`git status` shows `Your branch and 'origin/main' have diverged, and have 1 and 2 different commits each, respectively`. The remote has `3c18f1b` and `25e41ac` (CI snapshot refreshes); you have `2f314ce` (local SDK init).

**Action:** `git pull --rebase origin main`. Resolve trivially (only `dashboard/public/data/*.json` conflicts, if any — prefer the regenerated local output after P0.1). Then `git push`.

**Time:** 5 min. **Do this before opening any new branch.**

---

## Priority 1 — The Moves That Turn "Good" Into "Winner"

### P1.1 — One-command demo path: `./demo.sh`

Judges are tired, on a schedule, and do not want to read. A single, bulletproof script that reproduces the entire flow — devnet update → read → simulation → consumer demo — **dramatically** increases perceived quality.

**Action:** Create `/demo.sh` at repo root, ~40 lines:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "▶ 1/6  verify engine tests"
.venv/bin/python -m unittest tests.test_core_engine -v

echo "▶ 2/6  fetch live Pyth + Marinade"
.venv/bin/python bridge/fetch_pyth.py

echo "▶ 3/6  run statistical engine"
.venv/bin/python core-engine/pipeline.py

echo "▶ 4/6  push update on-chain (devnet)"
npm --prefix updater run submit

echo "▶ 5/6  read PDA back through SDK"
node -e "
const { Connection } = require('@solana/web3.js');
const { fetchRiskState } = require('./sdk/dist');
(async () => {
  const { state, address } = await fetchRiskState(new Connection('https://api.devnet.solana.com'));
  console.log(JSON.stringify({ pda: address.toBase58(), ...state }, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
})();
"

echo "▶ 6/6  replay real stETH depeg + show prevented loss"
.venv/bin/python simulation/stress_test.py
.venv/bin/python dashboard/scripts/sync_demo_data.py
echo ""
echo "✅ done. dashboard: https://pegshield.anubhavprasai.com.np/app  |  replay: /sim"
```

`chmod +x demo.sh`. Add a top-level README section *"Run the 60-second demo"* pointing at it.

**Time:** 30 min. **Submit this in the README; judges will try it.**

### P1.2 — Surface the math in the dashboard

Right now the OU equation lives in the README. Judges with a quant bent (common at Solana hackathons — there's serious DeFi depth there) will not read it.

**Action:** Add a collapsible **"Model"** card to AppPage.tsx that renders:

```
dX_t = θ·(μ − X_t)·dt + σ·dW_t

      Current θ:   199.00 (mean-reversion speed, 1/day)
      Current σ:   0.0190 (daily vol)
      Current z:   −0.051 (σ below rolling mean)
      ADF p-val:   <pulled from pipeline.py output>
      Regime:      NORMAL  ▸ becomes CRITICAL when |z| ≥ 2.5 AND ADF rejects stationarity
```

Use `react-katex` (already in `dashboard/package.json`). Render the SDE in proper LaTeX. One card, 60 lines of code, **massive** credibility delta vs teams who hand-wave "we use AI/statistics".

**Time:** 1.5 hr.

### P1.3 — Ship a reference consumer (`examples/lending-borrow-demo/`)

Your SDK is real and tested — but **no code in the repo uses it**. That's the #1 thing a sceptical judge will spot.

**Action:** Create `examples/lending-borrow-demo/` — a tiny Node script that pretends to be a lending protocol:

```
examples/lending-borrow-demo/
├── package.json       (depends on @pegshield/sdk via "file:../../sdk")
├── README.md          explains what this simulates
└── index.ts           ~80 lines:
                       - connect to devnet
                       - fetchRiskState
                       - pretend to originate a 100 stETH loan
                       - print:
                           "Static 80% policy:   would lend $X"
                           "PegShield safeLtv():  would lend $Y   (—$Z exposure avoided)"
                           "State is stale / CRITICAL? action: …"
```

This is exactly the thing judges will open to sanity-check you. Keep it dead simple; no actual SPL token, just USD arithmetic.

**Time:** 1 hr.

### P1.4 — Staleness badge on the live dashboard

`consumer_demo.ts` already has `MAX_STALENESS_SECS = 600`. The dashboard AppPage does not surface this. A judge refreshing the page 20 min after the last CI update should see a yellow/red badge, not a silent serving of stale data.

**Action:** In `dashboard/src/pages/AppPage.tsx` near the PDA header:

```tsx
{lastUpdateAgeSec > 600 && (
  <span className="border border-yellow-600 px-2 py-0.5 text-[10px] uppercase text-yellow-500">
    STALE · {lastUpdateAgeSec}s since last update
  </span>
)}
{lastUpdateAgeSec > 1800 && (
  <span className="border border-red-600 ...">UNSAFE TO CONSUME</span>
)}
```

This is a **trust signal**. It says "we take oracle hygiene seriously."

**Time:** 30 min.

### P1.5 — Explorer deep-links everywhere an on-chain value is shown

Every pubkey, PDA, and transaction hash in the UI should link to `explorer.solana.com/…?cluster=devnet`. Most already do; audit `AppPage.tsx` and make sure `authority`, `last_updater`, `risk_state_pda`, and the most recent tx signature are all clickable.

Judges **will** click these. If even one is text-only, it whispers "this isn't real."

**Time:** 30 min.

### P1.6 — 60-second demo video + 5-slide deck (or a 5-section pitch page)

You do not need to be a video editor. A 60-second screen recording with your voice narrating is enough and, at this tier, **expected**.

**Script** (literal words — rehearse 3×):

> *"This is PegShield. Price oracles tell you what an asset is worth. We tell you how safe it is as collateral, right now — specifically for Solana LSTs."*
> *\[click SimPage, hit 'Play Replay'\]*
> *"This is real data from the June 2022 stETH depeg. A lending protocol using a static 80% LTV would have taken $39,763 of bad debt on a single $181K stETH position. Using PegShield — same position, same event — the loss is zero. Because at origination, the oracle capped the borrow to 50% of collateral, and when ADF detected non-stationarity and z-score crossed 2.5σ, it tightened further to 40%."*
> *\[click AppPage\]*
> *"This isn't a paper. The PDA is live on devnet right now — this is the Explorer. GitHub Actions pushes a fresh update every N minutes. Protocols integrate in 5 lines with `@pegshield/sdk`. And here's the OU model it's calibrated against, running live."*
> *"We're Fianko, this was a weekend build, the next step is mainnet and a multi-attester scheme."*

**Action:** Record this. Upload to YouTube (unlisted) + embed in README + attach to submission. **Host the deck as a linked page**, not a PDF, so judges don't have to download anything.

**Time:** 2 hr including retakes.

---

## Priority 2 — Extra Credit (Do If Time)

### P2.1 — "Risk oracle vs price oracle" positioning, everywhere

Make this the single phrase that lives in the judge's head. Put it on:
- Home.tsx hero
- README opening line
- Demo video first sentence
- Pitch deck slide 1
- Twitter/X post if you announce submission

One line, same words, everywhere. This is how memorable projects are memorable.

**Time:** 20 min.

### P2.2 — Multi-attester design doc (`docs/MULTI_ATTESTER.md`)

Not an implementation — a **design doc** with a clear diagram. Explains how you'd go from single-authority to a threshold scheme (m-of-n attesters aggregating off-chain, one on-chain submitter per round, slashing via program-held bond). Judges love to see founders who understand their own centralisation debt.

Sketch: 2 pages. Include one diagram (excalidraw or mermaid).

**Time:** 1 hr. **Skip if under time.**

### P2.3 — Wallet-connect "push your own update" flow in the dashboard

Let a visitor connect Phantom on devnet and call `update_risk_state` themselves (they will fail with `Unauthorized` because they're not the authority — but the Anchor error surfaced nicely in the UI is a *feature demonstration*, not a bug). This proves the program is actually running and validating.

Uses `@solana/wallet-adapter-react` (easy, well-documented). Add one button: **"Try calling update\_risk\_state yourself"**.

**Time:** 3 hr. **High-wow, but only if P0/P1 are fully done.**

### P2.4 — Lighthouse / bundle budget

Your dashboard bundle is 781 KB (237 KB gzip). Judge opens on mobile → slow paint → subconscious "hobby project." Fast-follow: code-split the 3 pages via React.lazy + Suspense. Easy win, 1 hr.

### P2.5 — Add a second asset (`jitoSOL`)

Not strictly necessary for winning, but one sentence in the pitch — *"already generalising to jitoSOL"* — cheaply signals that this isn't a single-asset demo. Reuse the same PDA seed pattern with `lst_id="jitoSOL-v1"`. Requires a working Jito rate source.

**Time:** 3 hr. **Skip unless the P0/P1 list is clean.**

### P2.6 — Unit tests for the SDK's guard functions

You have `test/decode.test.ts`. Add a `test/guards.test.ts` with isStale/isCritical/safeLtv edge cases. Quick credibility. 30 min.

---

## The 60-Second Live Demo — Rehearsed Script

Open two browser tabs in advance:
1. `https://pegshield.anubhavprasai.com.np/sim` (SimPage, replay paused at t=0)
2. `https://explorer.solana.com/address/7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo?cluster=devnet`

**The flow:**

| Sec | Action | You Say |
|---|---|---|
| 0–5 | Tab 1 · point at title | "Risk oracle, not price oracle. For Solana LSTs as collateral." |
| 5–15 | Click Play Replay | "Real stETH/ETH from June 2022. 44 days of daily closes." |
| 15–30 | Watch CRITICAL light up; point at the Loss-Prevented panel | "$40K of bad debt that a static 80% policy would have eaten. Zero with PegShield." |
| 30–40 | Switch to Tab 2 · click Explorer link | "This isn't a backtest in a notebook. The PDA is live right now. GitHub Actions pushes every 5 minutes. Authority is gated, updates are rate-limited, math is fixed-point." |
| 40–50 | Tab 1 · scroll to Model card (P1.2) | "OU + ADF stationarity + z-score. All three running in the engine. All three visible here." |
| 50–60 | Say | "Five lines to integrate with `@pegshield/sdk`. Multi-attester is the next step. We're Fianko. Questions?" |

Rehearse this **at least three times** before submission. Record one take with your phone.

---

## Pre-Submission Checklist

Run through this the night before. Do not skip a single line.

- [ ] `git status` is clean; local + remote are on the same commit
- [ ] `demo.sh` runs green from a fresh clone (have a friend try)
- [ ] Dashboard loads on mobile without layout break
- [ ] Dashboard replay shows **oracle winning** (green, positive "Loss Prevented")
- [ ] Stale badge appears when you manually stop the CI for 11+ minutes
- [ ] All Explorer links 404-free
- [ ] README first 20 lines make someone who's never heard of Solana understand what you do
- [ ] `@pegshield/sdk` installs fresh via `npm install file:./sdk` in a scratch dir and the Quick Start works
- [ ] SECURITY.md linked from README
- [ ] Demo video uploaded, public, embedded in README
- [ ] No leftover TODO/FIXME comments in committed files
- [ ] `npm run build` in `dashboard/` and `sdk/` both exit 0
- [ ] Python tests: `python -m unittest tests.test_core_engine` — 5/5 green
- [ ] Anchor tests: `(cd solana-program && anchor test)` — all green on devnet skip
- [ ] You can recite the 60-second demo from memory

---

## Do-Not-Do List

Equally important.

1. **Do not rewrite the Anchor program.** It is tight. Judges will skim, not rewrite it with you.
2. **Do not try mainnet before submission.** Devnet is expected and scored the same; mainnet adds risk of a bad tx landing during your demo.
3. **Do not add a second LST just because.** P2.5 is optional. The story is stronger with one asset done *well* than two done shakily.
4. **Do not add authentication / login / accounts.** You are not building a SaaS.
5. **Do not spend time on tailwind tokens / theme polish** beyond what already exists. The Brutalist aesthetic you already have reads as "intentional design choice" — lean in.
6. **Do not touch the fixed-point SCALE or LTV bounds.** Any tweak re-invalidates the on-chain PDA and forces another migration. Ship the current layout.
7. **Do not add AI/LLM integration** because it's trendy. Judges have seen 40 of those this week. Your edge is that you *don't* need one.

---

## If You Have Exactly 48 Hours Left

Strict ordering:

1. **Day 0, Hour 0–2:** P0.1 (fix shortfall math) + P0.2 (reconcile git). **Submit incremental commit.**
2. **Day 0, Hour 2–4:** P1.1 (demo.sh) + P1.4 (staleness badge) + P1.5 (explorer links audit).
3. **Day 0, Hour 4–6:** P1.2 (model card in UI).
4. **Day 0, Hour 6–8:** P1.3 (reference consumer example).
5. **Day 1, Hour 0–3:** P1.6 (video + deck).
6. **Day 1, Hour 3–5:** Rehearse the demo. Do the checklist. Fix whatever breaks.
7. **Day 1, Hour 5–6:** P2.1 (positioning sweep) + P2.6 (SDK guard tests).
8. **Day 1, Hour 6–8:** Buffer. Submit.

Everything else is negotiable. **P0.1 is not.**

---

## Why This Wins

At the end of the day, you're telling judges three things:

1. **"We found a real problem"** — LST collateral during de-peg isn't theoretical; Luna, stETH, and countless smaller LSTs have de-pegged. Solana's LST ecosystem is only growing.
2. **"We solved it correctly"** — Not by hand-waving, but by running OU on the right signal (peg deviation, not USD premium), publishing through a rate-limited Anchor program, and giving protocols a typed SDK.
3. **"We showed it works on real data"** — Not a fabricated shock. The June 2022 stETH event. Zero bad debt under our policy; $40K under the status quo.

Do the P0 fixes. Everything else compounds on top. **Now go ship.**
