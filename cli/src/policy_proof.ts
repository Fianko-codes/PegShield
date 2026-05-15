export type StressPoint = {
  timestamp: string;
  peg_deviation: number;
  z_score: number;
  regime_flag: number;
  ltv_with_oracle: number;
  ltv_no_oracle: number;
  shortfall_dynamic: number;
  shortfall_static: number;
};

export type StressBundle = {
  replay?: {
    id?: string;
    title?: string;
    tagline?: string;
  };
  points?: StressPoint[];
  summary: {
    peak_shortfall_static: number;
    peak_shortfall_dynamic: number;
    final_dynamic_ltv: number;
    final_static_ltv: number;
    max_loss_prevented: number;
    peak_ltv_cut: number;
    critical_rows: number;
  };
};

export type OracleSnapshot = {
  lst_id?: string;
  asset_symbol?: string;
  suggested_ltv?: number;
  peg_deviation_pct?: number | null;
  regime_flag?: number;
  status?: string;
  timestamp?: number;
  program_id?: string;
  risk_state_pda?: string;
  authority?: string;
  network?: string;
};

export type PolicyProofOptions = {
  collateralUnits?: number;
  unitPriceUsd?: number;
  requestedBorrowUsd?: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round(value * 10_000) / 100;
}

function firstCriticalPoint(points: StressPoint[] = []): StressPoint | null {
  return points.find((point) => point.regime_flag === 1) ?? null;
}

function firstStaticShortfallPoint(points: StressPoint[] = []): StressPoint | null {
  return points.find((point) => point.shortfall_static > 0) ?? null;
}

export function buildPolicyProof(
  stress: StressBundle,
  snapshot: OracleSnapshot,
  options: PolicyProofOptions = {},
) {
  const collateralUnits = options.collateralUnits ?? 100;
  const unitPriceUsd = options.unitPriceUsd ?? 1814.63;
  const collateralValueUsd = collateralUnits * unitPriceUsd;
  const staticLtv = stress.summary.final_static_ltv;
  const pegShieldStressLtv = stress.summary.final_dynamic_ltv;
  const staticBorrowLimitUsd = collateralValueUsd * staticLtv;
  const pegShieldBorrowLimitUsd = collateralValueUsd * pegShieldStressLtv;
  const requestedBorrowUsd =
    options.requestedBorrowUsd ?? pegShieldBorrowLimitUsd + (staticBorrowLimitUsd - pegShieldBorrowLimitUsd) * 0.5;
  const critical = firstCriticalPoint(stress.points);
  const firstShortfall = firstStaticShortfallPoint(stress.points);

  return {
    project: "PegShield",
    tagline: "On-chain collateral circuit breaker for Solana LST lending.",
    primitive: {
      category: "risk oracle",
      claim: "Price oracles say what collateral is worth; PegShield publishes whether a protocol should keep lending against it and at what LTV.",
      on_chain_surface: "RiskState PDA keyed by lst_id with suggested_ltv_bps, regime_flag, timestamp, and fixed-point risk diagnostics.",
      why_solana: "Lenders can enforce the feed inside the borrow path instead of waiting for governance to change static LTV tables.",
    },
    live_devnet_artifact: {
      network: snapshot.network ?? "solana-devnet",
      lst_id: snapshot.lst_id ?? "mSOL-v2",
      asset_symbol: snapshot.asset_symbol ?? "mSOL",
      program_id: snapshot.program_id ?? null,
      risk_state_pda: snapshot.risk_state_pda ?? null,
      authority: snapshot.authority ?? null,
      current_suggested_ltv_pct: snapshot.suggested_ltv == null ? null : roundPct(snapshot.suggested_ltv),
      current_regime: snapshot.regime_flag === 1 ? "CRITICAL" : snapshot.status ?? "NORMAL",
      current_peg_deviation_pct:
        snapshot.peg_deviation_pct == null ? null : Math.round(snapshot.peg_deviation_pct * 10_000) / 100,
    },
    stress_replay_proof: {
      scenario: stress.replay?.title ?? stress.replay?.id ?? "stETH June 2022 depeg",
      first_critical_signal: critical
        ? {
            timestamp: critical.timestamp,
            peg_deviation_pct: roundPct(critical.peg_deviation),
            z_score: critical.z_score,
            pegshield_ltv_pct: roundPct(critical.ltv_with_oracle),
          }
        : null,
      first_static_shortfall: firstShortfall
        ? {
            timestamp: firstShortfall.timestamp,
            static_shortfall_usd: roundMoney(firstShortfall.shortfall_static),
          }
        : null,
      peak_static_shortfall_usd: roundMoney(stress.summary.peak_shortfall_static),
      peak_pegshield_shortfall_usd: roundMoney(stress.summary.peak_shortfall_dynamic),
      max_scenario_loss_prevented_usd: roundMoney(stress.summary.max_loss_prevented),
      peak_ltv_cut_pct: roundPct(stress.summary.peak_ltv_cut),
      guardrail:
        "Scenario-scale replay only: this proves earlier collateral tightening, not guaranteed zero production bad debt.",
    },
    borrow_gate_proof: {
      collateral: `${collateralUnits} stETH-like units at $${unitPriceUsd}`,
      collateral_value_usd: roundMoney(collateralValueUsd),
      requested_borrow_usd: roundMoney(requestedBorrowUsd),
      static_80_ltv_limit_usd: roundMoney(staticBorrowLimitUsd),
      pegshield_stress_limit_usd: roundMoney(pegShieldBorrowLimitUsd),
      static_policy_decision: requestedBorrowUsd <= staticBorrowLimitUsd ? "ALLOW" : "REJECT",
      pegshield_policy_decision: requestedBorrowUsd <= pegShieldBorrowLimitUsd ? "ALLOW" : "REJECT",
      new_credit_removed_usd: roundMoney(staticBorrowLimitUsd - pegShieldBorrowLimitUsd),
      takeaway: "The same borrow can pass a static table and fail once PegShield cuts LTV on-chain.",
    },
    protocol_status: {
      one_sentence_summary:
        "PegShield is a reusable Solana collateral-circuit-breaker primitive that turns static LST collateral factors into live on-chain borrow limits.",
      implemented_surfaces: [
        "devnet RiskState PDA",
        "Pyth + reference-rate bridge",
        "OU/ADF risk engine",
        "typed SDK guards",
        "operator CLI",
        "PegShield Gate and borrow-gate reference integration",
        "historical stress replay",
      ],
      remaining_production_work: [
        "not mainnet production infrastructure",
        "not audited",
        "independent attester operations are not live yet",
      ],
    },
  };
}
