import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(webRoot, "..");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const close = (actual, expected, label, epsilon = 1e-8) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, received ${actual}`,
  );

const snapshots = readJson(join(webRoot, "data", "snapshots.json"));
const stress = readJson(join(webRoot, "data", "stress.json"));

for (const snapshot of snapshots.snapshots) {
  const artifact = readJson(
    join(repoRoot, "artifacts", `oracle_state.${snapshot.lstId}.json`),
  );
  assert.equal(snapshot.lstId, artifact.lst_id, `${snapshot.lstId}: lst id`);
  assert.equal(snapshot.programId, artifact.program_id, `${snapshot.lstId}: program`);
  assert.equal(snapshot.riskStatePda, artifact.risk_state_pda, `${snapshot.lstId}: PDA`);
  close(snapshot.statisticalLtv, artifact.statistical_ltv, `${snapshot.lstId}: statistical LTV`);
  close(snapshot.suggestedLtv, artifact.suggested_ltv, `${snapshot.lstId}: suggested LTV`);

  const expectedLtv = snapshot.regimeFlag === 1
    ? 0.4
    : Math.max(
        0.4,
        Math.min(
          0.8,
          snapshot.statisticalLtv -
            snapshot.liquidityRisk.haircut -
            snapshot.dataQualityRisk.haircut,
        ),
      );
  close(snapshot.suggestedLtv, expectedLtv, `${snapshot.lstId}: LTV arithmetic`);
}

for (const scenario of stress.scenarios) {
  const { points, summary } = scenario;
  const min = (key) => Math.min(...points.map((point) => point[key]));
  const max = (key) => Math.max(...points.map((point) => point[key]));
  const criticalRows = points.filter((point) => point.regime_flag === 1).length;
  const avoided = points.map(
    (point) => point.shortfall_static - point.shortfall_dynamic,
  );

  assert.equal(summary.rowCount, points.length, `${scenario.id}: row count`);
  assert.equal(summary.criticalRows, criticalRows, `${scenario.id}: critical rows`);
  close(
    summary.criticalDurationRatio,
    criticalRows / points.length,
    `${scenario.id}: critical duration`,
  );
  close(summary.peakShortfallStatic, max("shortfall_static"), `${scenario.id}: static shortfall`, 1e-6);
  close(summary.peakShortfallDynamic, max("shortfall_dynamic"), `${scenario.id}: dynamic shortfall`, 1e-6);
  close(summary.maxLossPrevented, Math.max(...avoided), `${scenario.id}: avoided shortfall`, 1e-6);
  close(
    summary.peakLtvCut,
    max("ltv_no_oracle") - min("ltv_with_oracle"),
    `${scenario.id}: peak LTV cut`,
  );

  for (const point of points) {
    assert.ok(
      point.ltv_with_oracle >= 0.4 && point.ltv_with_oracle <= 0.8,
      `${scenario.id}: dynamic LTV outside 40–80% bounds`,
    );
    close(point.ltv_no_oracle, 0.8, `${scenario.id}: static policy`);
    if (point.regime_flag === 1) {
      close(point.ltv_with_oracle, 0.4, `${scenario.id}: critical floor`);
    }
  }
}

const defaultScenario = stress.scenarios.find(
  (scenario) => scenario.id === stress.defaultScenarioId,
);
assert.ok(defaultScenario, "default stress scenario exists");
close(
  Math.min(...defaultScenario.points.map((point) => point.ltv_with_oracle)),
  0.4,
  "default scenario minimum LTV",
);

console.log(
  `[verify-data] verified ${snapshots.snapshots.length} oracle snapshots and ${stress.scenarios.length} stress scenarios against repo artifacts and LTV invariants.`,
);
