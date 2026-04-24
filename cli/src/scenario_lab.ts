import * as fs from "fs";

type ScenarioPoint = {
  timestamp: string;
  peg_deviation: number;
  z_score: number;
  regime_flag: number;
  ltv_with_oracle: number;
  ltv_no_oracle: number;
  shortfall_dynamic: number;
  shortfall_static: number;
};

type Scenario = {
  id: string;
  title: string;
  tagline?: string;
  risk_focus?: string;
  points: ScenarioPoint[];
  summary: {
    peak_shortfall_static: number;
    peak_shortfall_dynamic: number;
    max_loss_prevented: number;
    peak_ltv_cut: number;
    critical_rows: number;
    recovered_to_monitoring?: boolean;
  };
};

export type ScenarioBundle = {
  scenarios: Scenario[];
};

function pct(value: number): number {
  return Math.round(value * 10_000) / 100;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function first<T>(items: T[], predicate: (item: T) => boolean): T | null {
  return items.find(predicate) ?? null;
}

export function buildScenarioLab(bundle: ScenarioBundle) {
  const scenarios = bundle.scenarios.map((scenario) => {
    const firstCut = first(
      scenario.points,
      (point) => point.ltv_with_oracle < point.ltv_no_oracle,
    );
    const firstCritical = first(scenario.points, (point) => point.regime_flag === 1);
    const firstStaticShortfall = first(
      scenario.points,
      (point) => point.shortfall_static > 0,
    );
    const falsePositiveCheck =
      scenario.summary.peak_shortfall_static === 0
      && scenario.summary.peak_ltv_cut > 0
      && Boolean(scenario.summary.recovered_to_monitoring);

    return {
      id: scenario.id,
      title: scenario.title,
      risk_focus: scenario.risk_focus,
      first_pegshield_ltv_cut: firstCut
        ? {
            timestamp: firstCut.timestamp,
            ltv_pct: pct(firstCut.ltv_with_oracle),
            peg_deviation_pct: pct(firstCut.peg_deviation),
            z_score: firstCut.z_score,
          }
        : null,
      first_critical_signal: firstCritical
        ? {
            timestamp: firstCritical.timestamp,
            ltv_pct: pct(firstCritical.ltv_with_oracle),
            peg_deviation_pct: pct(firstCritical.peg_deviation),
            z_score: firstCritical.z_score,
          }
        : null,
      first_static_shortfall: firstStaticShortfall
        ? {
            timestamp: firstStaticShortfall.timestamp,
            static_shortfall_usd: money(firstStaticShortfall.shortfall_static),
          }
        : null,
      peak_static_shortfall_usd: money(scenario.summary.peak_shortfall_static),
      peak_pegshield_shortfall_usd: money(scenario.summary.peak_shortfall_dynamic),
      max_loss_prevented_usd: money(scenario.summary.max_loss_prevented),
      peak_ltv_cut_pct: pct(scenario.summary.peak_ltv_cut),
      critical_rows: scenario.summary.critical_rows,
      recovered_to_monitoring: Boolean(scenario.summary.recovered_to_monitoring),
      false_positive_check: falsePositiveCheck
        ? "temporary cut with no modeled static shortfall and recovery to monitoring"
        : null,
    };
  });

  const scenariosWithLossPrevention = scenarios.filter(
    (scenario) => scenario.max_loss_prevented_usd > 0,
  );
  const scenariosWithFalsePositiveCoverage = scenarios.filter(
    (scenario) => scenario.false_positive_check,
  );

  return {
    project: "PegShield",
    lab: "scenario stress proof",
    claim:
      "PegShield is evaluated as a collateral circuit breaker across historical and synthetic stress paths, not only one cherry-picked replay.",
    scenario_count: scenarios.length,
    scenarios_with_loss_prevention: scenariosWithLossPrevention.length,
    scenarios_with_false_positive_recovery: scenariosWithFalsePositiveCoverage.length,
    total_modeled_loss_prevented_usd: money(
      scenarios.reduce((sum, scenario) => sum + scenario.max_loss_prevented_usd, 0),
    ),
    rows: scenarios,
  };
}

export function loadScenarioLab(path: string) {
  return buildScenarioLab(JSON.parse(fs.readFileSync(path, "utf-8")) as ScenarioBundle);
}
