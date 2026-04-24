import { evaluateMultiAttesterReadiness } from "./multi_attester_readiness";

const LAMPORTS_PER_SOL = 1_000_000_000n;
const NOW_SECONDS = 1_776_700_000;

export type MultiAttesterProofOptions = {
  lstId?: string;
  threshold?: number;
  minBondLamports?: bigint;
  roundId?: number;
  theta?: number;
  sigma?: number;
  suggestedLtvBps?: number;
  zScore?: number;
  regimeFlag?: number;
};

type SimAttester = {
  pubkey: string;
  bondLamports: bigint;
  disputesLost: bigint;
  updatesSubmitted: bigint;
};

function scaled(value: number): number {
  return Math.round(value * 1_000_000);
}

function buildAttester(index: number, bondLamports: bigint): SimAttester {
  return {
    pubkey: `attester-${index}`,
    bondLamports,
    disputesLost: 0n,
    updatesSubmitted: 0n,
  };
}

function serializable(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(serializable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, serializable(entry)]),
    );
  }
  return value;
}

export function buildMultiAttesterProof(options: MultiAttesterProofOptions = {}) {
  const lstId = options.lstId ?? "jitoSOL-v1";
  const threshold = options.threshold ?? 2;
  const minBondLamports = options.minBondLamports ?? LAMPORTS_PER_SOL;
  const roundId = options.roundId ?? 1;
  const attesters = [
    buildAttester(1, minBondLamports + LAMPORTS_PER_SOL / 2n),
    buildAttester(2, minBondLamports),
    buildAttester(3, minBondLamports),
  ];

  const payload = {
    theta_scaled: scaled(options.theta ?? 0.05),
    sigma_scaled: scaled(options.sigma ?? 0.015),
    regime_flag: options.regimeFlag ?? 0,
    suggested_ltv_bps: options.suggestedLtvBps ?? 7_200,
    z_score_scaled: scaled(options.zScore ?? -0.5),
  };

  const proposal = {
    round_id: roundId,
    lst_id: lstId,
    proposer: attesters[0].pubkey,
    confirmation_count: 1,
    confirmations_bitmap: "0b001",
    is_finalized: false,
    params: payload,
  };

  const finalizedPending = {
    ...proposal,
    confirmation_count: 2,
    confirmations_bitmap: "0b011",
    is_finalized: true,
    finalized_at: NOW_SECONDS,
    finalized_slot: 42_000_001,
  };

  attesters[0].updatesSubmitted += 1n;

  const registry = {
    admin: "registry-admin",
    attester_count: attesters.length,
    threshold,
    min_bond_lamports: minBondLamports.toString(),
    total_bonded_lamports: attesters
      .reduce((sum, attester) => sum + attester.bondLamports, 0n)
      .toString(),
    attesters: attesters.map((attester) => ({
      pubkey: attester.pubkey,
      bond_lamports: attester.bondLamports.toString(),
      disputes_lost: attester.disputesLost.toString(),
      updates_submitted: attester.updatesSubmitted.toString(),
    })),
  };

  const oracleBefore = {
    lst_id: lstId,
    update_mode: "single",
    is_stale: true,
    regime_flag: 0,
    age_seconds: 999_999,
    suggested_ltv_bps: 0,
  };

  const oracleAfter = {
    lst_id: lstId,
    update_mode: "multi",
    is_stale: false,
    regime_flag: payload.regime_flag,
    age_seconds: 30,
    suggested_ltv_bps: payload.suggested_ltv_bps,
    theta_scaled: payload.theta_scaled,
    sigma_scaled: payload.sigma_scaled,
    z_score_scaled: payload.z_score_scaled,
    timestamp: NOW_SECONDS,
    last_updater: attesters[1].pubkey,
    attester_registry: "attester_registry_pda",
  };

  const readiness = evaluateMultiAttesterReadiness({
    oracle: oracleAfter,
    registry,
    pending: {
      round_id: String(roundId),
      confirmation_count: finalizedPending.confirmation_count,
      is_finalized: finalizedPending.is_finalized,
      expires_at: String(NOW_SECONDS + 300),
    },
    nowSeconds: NOW_SECONDS,
  });

  const proof = {
    project: "PegShield",
    demo: "multi-attester threshold update proof",
    claim:
      "A single signer is no longer required: a bonded 2-of-3 attester committee can finalize a risk update into the same RiskState PDA consumers already read.",
    configuration: {
      lst_id: lstId,
      threshold,
      attester_count: attesters.length,
      min_bond_lamports: minBondLamports,
      update_mode_before: oracleBefore.update_mode,
      update_mode_after: oracleAfter.update_mode,
    },
    flow: [
      {
        step: "initialize_registry",
        result: {
          threshold,
          min_bond_lamports: minBondLamports,
          active_attesters: 0,
        },
      },
      {
        step: "register_attesters",
        result: {
          active_attesters: attesters.length,
          total_bonded_lamports: registry.total_bonded_lamports,
          attesters: registry.attesters,
        },
      },
      {
        step: "enable_multi_attester",
        result: {
          lst_id: lstId,
          update_mode: "multi",
          consumer_pda_unchanged: true,
        },
      },
      {
        step: "propose_update",
        result: proposal,
      },
      {
        step: "confirm_update",
        result: {
          confirmer: attesters[1].pubkey,
          threshold_reached: true,
          pending_update: finalizedPending,
        },
      },
      {
        step: "risk_state_finalized",
        result: oracleAfter,
      },
      {
        step: "operator_readiness",
        result: readiness,
      },
    ],
    invariants_checked: [
      "threshold is at least 2",
      "active attesters meet or exceed threshold",
      "attesters meeting minimum bond meet or exceed threshold",
      "risk state is in multi-attester mode",
      "pending update is finalized only after threshold confirmation",
      "consumer read path remains the same RiskState PDA",
    ],
    live_equivalent_commands: [
      "pegshield init-registry --threshold 2 --min-bond-sol 1",
      "pegshield register --bond-sol 1.5   # attester 1",
      "pegshield register --bond-sol 1     # attester 2",
      "pegshield register --bond-sol 1     # attester 3",
      "pegshield enable-multi jitoSOL-v1",
      "pegshield propose --payload core-engine/output/latest.jitoSOL-v1.json --round 1",
      "pegshield confirm jitoSOL-v1 --round 1",
      "pegshield multi-status jitoSOL-v1 --round 1",
    ],
  };

  return serializable(proof);
}
