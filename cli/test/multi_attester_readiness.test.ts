import assert from "node:assert/strict";
import { evaluateMultiAttesterReadiness } from "../src/multi_attester_readiness";

const healthyOracle = {
  update_mode: "multi",
  is_stale: false,
  regime_flag: 0,
  age_seconds: 30,
};

const healthyRegistry = {
  attester_count: 3,
  threshold: 2,
  total_bonded_lamports: "3000000000",
  min_bond_lamports: "1000000000",
  attesters: [
    { pubkey: "attester-1", bond_lamports: "1000000000", disputes_lost: "0" },
    { pubkey: "attester-2", bond_lamports: "1000000000", disputes_lost: "0" },
    { pubkey: "attester-3", bond_lamports: "1000000000", disputes_lost: "0" },
  ],
};

{
  const result = evaluateMultiAttesterReadiness({
    oracle: healthyOracle,
    registry: healthyRegistry,
  });

  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
}

{
  const result = evaluateMultiAttesterReadiness({
    oracle: { ...healthyOracle, update_mode: "single", is_stale: true, age_seconds: 900 },
    registry: {
      ...healthyRegistry,
      attester_count: 1,
      total_bonded_lamports: "1000000000",
      attesters: [healthyRegistry.attesters[0]],
    },
  });

  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("single-attester")));
  assert.ok(result.blockers.some((blocker) => blocker.includes("stale")));
  assert.ok(result.blockers.some((blocker) => blocker.includes("below threshold")));
}

{
  const result = evaluateMultiAttesterReadiness({
    oracle: healthyOracle,
    registry: healthyRegistry,
    pending: {
      round_id: "42",
      confirmation_count: 1,
      is_finalized: false,
      expires_at: "100",
    },
    nowSeconds: 200,
  });

  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("expired")));
}

console.log("multi-attester readiness tests passed");
