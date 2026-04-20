import assert from "node:assert/strict";
import type { RiskState } from "../src";
import { isCritical, isStale, safeLtv } from "../src";

function buildState(overrides: Partial<RiskState> = {}): RiskState {
  return {
    lstId: "mSOL-v2",
    theta: 199,
    sigma: 0.019,
    zScore: -0.05,
    suggestedLtv: 0.8,
    thetaScaled: 199_000_000n,
    sigmaScaled: 19_000n,
    zScoreScaled: -50_000n,
    suggestedLtvBps: 8000,
    regimeFlag: 0,
    slot: 123n,
    timestamp: 1_700_000_000n,
    authority: "11111111111111111111111111111111",
    lastUpdater: "11111111111111111111111111111111",
    updateMode: 0,
    attesterRegistry: "11111111111111111111111111111111",
    ...overrides,
  };
}

function main() {
  const fresh = buildState();

  assert.equal(isStale(buildState({ timestamp: 0n })), true, "zero timestamp is stale");
  assert.equal(
    isStale(fresh, Number(fresh.timestamp) + 600, 600),
    false,
    "exact max age boundary remains usable",
  );
  assert.equal(
    isStale(fresh, Number(fresh.timestamp) + 601, 600),
    true,
    "one second over max age is stale",
  );
  assert.equal(
    isStale(fresh, Number(fresh.timestamp) - 30, 600),
    false,
    "future-dated state is treated as fresh rather than forced stale",
  );

  assert.equal(isCritical(buildState({ regimeFlag: 0 })), false, "NORMAL regime");
  assert.equal(isCritical(buildState({ regimeFlag: 1 })), true, "CRITICAL regime");

  assert.equal(
    safeLtv(buildState({ suggestedLtv: 0.72 }), { nowSec: Number(fresh.timestamp) + 10 }),
    0.72,
    "fresh non-critical state returns oracle LTV",
  );
  assert.equal(
    safeLtv(buildState({ suggestedLtv: -0.1 }), { nowSec: Number(fresh.timestamp) + 10 }),
    0,
    "negative oracle LTV clamps to zero",
  );
  assert.equal(
    safeLtv(buildState({ suggestedLtv: 0.96 }), { nowSec: Number(fresh.timestamp) + 10 }),
    0.9,
    "default maxLtv clamps aggressive oracle values",
  );
  assert.equal(
    safeLtv(buildState({ suggestedLtv: 0.96 }), {
      nowSec: Number(fresh.timestamp) + 10,
      maxLtv: 0.85,
    }),
    0.85,
    "custom maxLtv clamp is respected",
  );
  assert.equal(
    safeLtv(buildState({ regimeFlag: 1, suggestedLtv: 0.75 }), {
      nowSec: Number(fresh.timestamp) + 10,
    }),
    0.4,
    "critical regime falls back to conservative default",
  );
  assert.equal(
    safeLtv(buildState({ timestamp: 0n, suggestedLtv: 0.75 }), {
      nowSec: Number(fresh.timestamp) + 10,
      fallbackLtv: 0.33,
    }),
    0.33,
    "stale state respects custom fallback",
  );

  console.log("guard tests passed");
}

main();
