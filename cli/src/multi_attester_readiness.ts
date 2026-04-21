export type DecodedOracle = {
  update_mode: string;
  is_stale: boolean;
  regime_flag: number;
  age_seconds: number;
};

export type DecodedRegistry = {
  attester_count: number;
  threshold: number;
  total_bonded_lamports: string;
  min_bond_lamports: string;
  attesters: Array<{
    pubkey: string;
    bond_lamports: string;
    disputes_lost: string;
  }>;
};

export type DecodedPendingUpdate = {
  round_id: string;
  confirmation_count: number;
  is_finalized: boolean;
  expires_at: string;
};

export type MultiAttesterReadinessInput = {
  oracle: DecodedOracle | null;
  registry: DecodedRegistry | null;
  pending?: DecodedPendingUpdate | null;
  nowSeconds?: number;
};

export function evaluateMultiAttesterReadiness(input: MultiAttesterReadinessInput) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const oracle = input.oracle;
  const registry = input.registry;
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (!oracle) {
    blockers.push("risk state PDA is missing");
  } else {
    if (oracle.update_mode !== "multi") {
      blockers.push("risk state is still in single-attester mode");
    }
    if (oracle.is_stale) {
      blockers.push(`oracle state is stale (${oracle.age_seconds}s old)`);
    }
    if (oracle.regime_flag === 1) {
      warnings.push("oracle is currently in CRITICAL regime");
    }
  }

  if (!registry) {
    blockers.push("attester registry is missing");
  } else {
    if (registry.threshold < 2) {
      blockers.push("threshold must be at least 2 for production multi-attester mode");
    }
    if (registry.attester_count < registry.threshold) {
      blockers.push(
        `active attesters (${registry.attester_count}) are below threshold (${registry.threshold})`,
      );
    }

    const minBond = BigInt(registry.min_bond_lamports);
    const activeWithMinBond = registry.attesters.filter(
      (attester) => BigInt(attester.bond_lamports) >= minBond,
    );
    if (activeWithMinBond.length < registry.threshold) {
      blockers.push(
        `attesters meeting min bond (${activeWithMinBond.length}) are below threshold (${registry.threshold})`,
      );
    }

    const totalBonded = BigInt(registry.total_bonded_lamports);
    const thresholdBond = minBond * BigInt(Math.max(registry.threshold, 0));
    if (totalBonded < thresholdBond) {
      blockers.push("total bonded stake is below threshold * min bond");
    }

    const slashedAttesters = registry.attesters.filter(
      (attester) => BigInt(attester.disputes_lost) > 0n,
    );
    if (slashedAttesters.length > 0) {
      warnings.push(`${slashedAttesters.length} active attester(s) have prior lost disputes`);
    }
  }

  if (input.pending) {
    const pending = input.pending;
    const expiresAt = Number.parseInt(pending.expires_at, 10);
    if (!pending.is_finalized && expiresAt <= nowSeconds) {
      blockers.push(`pending round ${pending.round_id} is expired and unfinalized`);
    } else if (!pending.is_finalized) {
      warnings.push(
        `pending round ${pending.round_id} has ${pending.confirmation_count} confirmation(s) and is not finalized`,
      );
    }
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
  };
}
