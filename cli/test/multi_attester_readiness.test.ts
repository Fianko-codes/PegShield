import assert from "node:assert/strict";
import { buildArtifactStatus } from "../src/artifact_status";
import { buildPolicyProof } from "../src/policy_proof";
import { buildMultiAttesterProof } from "../src/multi_attester_proof";
import { buildScenarioLab } from "../src/scenario_lab";
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

{
  const status = buildArtifactStatus(
    {
      lst_id: "mSOL-v2",
      asset_symbol: "mSOL",
      suggested_ltv: 0.62,
      statistical_ltv: 0.8,
      peg_deviation_pct: -0.02,
      z_score: -1.2,
      regime_flag: 0,
      timestamp: 100,
      liquidity_risk: {
        status: "STRESSED",
        score: 0.6,
        haircut: 0.18,
        components: {},
        inputs: {},
      },
      data_quality_risk: {
        status: "WATCH",
        score: 0.2,
        haircut: 0.03,
        components: {},
        inputs: {},
      },
    },
    160,
  );

  assert.equal(status.age_seconds, 60);
  assert.equal(status.suggested_ltv, 0.62);
  assert.ok(status.why_ltv_moved.some((reason) => reason.includes("Liquidity haircut")));
  assert.ok(status.why_ltv_moved.some((reason) => reason.includes("Data-quality haircut")));
}

console.log("artifact status tests passed");

{
  const proof = buildPolicyProof(
    {
      replay: { title: "stETH/ETH June 2022 depeg" },
      points: [
        {
          timestamp: "2022-06-09T00:00:00+00:00",
          peg_deviation: -0.034,
          z_score: -2.96,
          regime_flag: 1,
          ltv_with_oracle: 0.4,
          ltv_no_oracle: 0.8,
          shortfall_dynamic: 0,
          shortfall_static: 0,
        },
        {
          timestamp: "2022-06-13T00:00:00+00:00",
          peg_deviation: -0.04,
          z_score: -1.88,
          regime_flag: 0,
          ltv_with_oracle: 0.4,
          ltv_no_oracle: 0.8,
          shortfall_dynamic: 0,
          shortfall_static: 7525.44,
        },
      ],
      summary: {
        peak_shortfall_static: 51946.382,
        peak_shortfall_dynamic: 0,
        final_dynamic_ltv: 0.4,
        final_static_ltv: 0.8,
        max_loss_prevented: 51946.382,
        peak_ltv_cut: 0.4,
        critical_rows: 6,
      },
    },
    {
      lst_id: "mSOL-v2",
      asset_symbol: "mSOL",
      suggested_ltv: 0.8,
      regime_flag: 0,
      network: "solana-devnet",
    },
  );

  assert.equal(proof.borrow_gate_proof.static_policy_decision, "ALLOW");
  assert.equal(proof.borrow_gate_proof.pegshield_policy_decision, "REJECT");
  assert.equal(proof.stress_replay_proof.first_critical_signal?.timestamp, "2022-06-09T00:00:00+00:00");
  assert.ok(proof.protocol_status.one_sentence_summary.includes("collateral-circuit-breaker"));
}

console.log("policy proof tests passed");

{
  const proof = buildMultiAttesterProof({
    lstId: "jitoSOL-v1",
    threshold: 2,
    roundId: 7,
    suggestedLtvBps: 7200,
  }) as any;

  assert.equal(proof.configuration.update_mode_before, "single");
  assert.equal(proof.configuration.update_mode_after, "multi");
  assert.equal(proof.flow.find((item: any) => item.step === "confirm_update").result.threshold_reached, true);
  assert.equal(proof.flow.find((item: any) => item.step === "risk_state_finalized").result.suggested_ltv_bps, 7200);
  assert.equal(proof.flow.find((item: any) => item.step === "operator_readiness").result.ready, true);
  assert.ok(proof.invariants_checked.some((item: string) => item.includes("threshold")));
}

console.log("multi-attester proof tests passed");

{
  const lab = buildScenarioLab({
    scenarios: [
      {
        id: "loss_case",
        title: "Loss Case",
        points: [
          {
            timestamp: "t1",
            peg_deviation: -0.01,
            z_score: -1,
            regime_flag: 0,
            ltv_with_oracle: 0.7,
            ltv_no_oracle: 0.8,
            shortfall_dynamic: 0,
            shortfall_static: 0,
          },
          {
            timestamp: "t2",
            peg_deviation: -0.05,
            z_score: -3,
            regime_flag: 1,
            ltv_with_oracle: 0.4,
            ltv_no_oracle: 0.8,
            shortfall_dynamic: 0,
            shortfall_static: 100,
          },
        ],
        summary: {
          peak_shortfall_static: 100,
          peak_shortfall_dynamic: 0,
          max_loss_prevented: 100,
          peak_ltv_cut: 0.4,
          critical_rows: 1,
          recovered_to_monitoring: false,
        },
      },
      {
        id: "false_positive",
        title: "False Positive",
        points: [
          {
            timestamp: "t1",
            peg_deviation: -0.02,
            z_score: -2,
            regime_flag: 0,
            ltv_with_oracle: 0.6,
            ltv_no_oracle: 0.8,
            shortfall_dynamic: 0,
            shortfall_static: 0,
          },
        ],
        summary: {
          peak_shortfall_static: 0,
          peak_shortfall_dynamic: 0,
          max_loss_prevented: 0,
          peak_ltv_cut: 0.2,
          critical_rows: 0,
          recovered_to_monitoring: true,
        },
      },
    ],
  });

  assert.equal(lab.scenario_count, 2);
  assert.equal(lab.scenarios_with_loss_prevention, 1);
  assert.equal(lab.scenarios_with_false_positive_recovery, 1);
  assert.equal(lab.total_modeled_loss_prevented_usd, 100);
  assert.equal(lab.rows[0].first_static_shortfall?.timestamp, "t2");
}

console.log("scenario lab tests passed");
