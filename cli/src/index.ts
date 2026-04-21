#!/usr/bin/env node

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { evaluateMultiAttesterReadiness } from "./multi_attester_readiness";
import { buildArtifactStatus, OracleSnapshot } from "./artifact_status";

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCALE = 1_000_000;
const MAX_STALENESS_SECS = 600;
const ATTESTER_REGISTRY_SEED = "attester_registry";
const PENDING_UPDATE_SEED = "pending_update";
const DISPUTE_RECORD_SEED = "dispute_record";
const DEFAULT_LSTS = ["mSOL-v2", "jitoSOL-v1", "bSOL-v1"];

type RiskPayload = {
  lst_id: string;
  asset_symbol?: string;
  theta: number;
  sigma: number;
  regime_flag: number;
  suggested_ltv: number;
  z_score: number;
};

type RiskStateAccount = {
  lstId: string;
  thetaScaled: anchor.BN;
  sigmaScaled: anchor.BN;
  regimeFlag: number;
  suggestedLtvBps: number;
  zScoreScaled: anchor.BN;
  slot: anchor.BN;
  timestamp: anchor.BN;
  authority: PublicKey;
  lastUpdater: PublicKey;
  updateMode: number;
  attesterRegistry: PublicKey;
};

type RegistryEntry = {
  pubkey: PublicKey;
  bond: anchor.BN;
  registeredAt: anchor.BN;
  unregisterInitiatedAt: anchor.BN;
  updatesSubmitted: anchor.BN;
  disputesLost: anchor.BN;
  isActive: boolean;
};

type RegistryAccount = {
  admin: PublicKey;
  attesterCount: number;
  threshold: number;
  totalBonded: anchor.BN;
  minBond: anchor.BN;
  slashDestination: PublicKey;
  attesters: RegistryEntry[];
};

type PendingUpdateAccount = {
  roundId: anchor.BN;
  lstId: string;
  attesterRegistry: PublicKey;
  proposer: PublicKey;
  proposedAt: anchor.BN;
  proposedSlot: anchor.BN;
  expiresAt: anchor.BN;
  confirmationCount: number;
  confirmationsBitmap: number;
  isFinalized: boolean;
  finalizedAt: anchor.BN;
  finalizedSlot: anchor.BN;
  params: {
    thetaScaled: anchor.BN;
    sigmaScaled: anchor.BN;
    regimeFlag: number;
    suggestedLtvBps: number;
    zScoreScaled: anchor.BN;
  };
};

type DisputeRecordAccount = {
  lstId: string;
  disputedSlot: anchor.BN;
  finalizedSlot: anchor.BN;
  disputedAttester: PublicKey;
  disputer: PublicKey;
  evidenceHash: number[];
  filedAt: anchor.BN;
  resolutionDeadline: anchor.BN;
  isResolved: boolean;
  attesterSlashed: boolean;
  slashAmount: anchor.BN;
  disputerReward: anchor.BN;
  disputedThetaScaled: anchor.BN;
  disputedSigmaScaled: anchor.BN;
  disputedRegimeFlag: number;
  disputedLtvBps: number;
  disputedZScoreScaled: anchor.BN;
};

type ProgramContext = {
  connection: Connection;
  wallet: anchor.Wallet;
  provider: anchor.AnchorProvider;
  program: any;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveRepoPath(targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(REPO_ROOT, targetPath);
}

function loadIdl(): anchor.Idl {
  const candidatePaths = [
    path.resolve(REPO_ROOT, "solana-program", "idl", "risk_oracle.json"),
    path.resolve(REPO_ROOT, "solana-program", "target", "idl", "risk_oracle.json"),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, "utf-8")) as anchor.Idl;
    }
  }

  throw new Error(`Unable to find risk_oracle IDL. Checked: ${candidatePaths.join(", ")}`);
}

function loadWallet(): anchor.Wallet {
  const rawKeypair = JSON.parse(
    fs.readFileSync(resolveRepoPath(requiredEnv("UPDATER_KEYPAIR_PATH")), "utf-8"),
  ) as number[];
  return new anchor.Wallet(Keypair.fromSecretKey(Uint8Array.from(rawKeypair)));
}

function getContext(): ProgramContext {
  const connection = new Connection(requiredEnv("SOLANA_RPC_URL"), "confirmed");
  const wallet = loadWallet();
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  const program = new anchor.Program(loadIdl(), provider) as any;
  return { connection, wallet, provider, program };
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const flag = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(flag, true);
      continue;
    }

    flags.set(flag, next);
    index += 1;
  }

  return { positional, flags };
}

function flagValue(flags: Map<string, string | true>, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function flagBoolean(flags: Map<string, string | true>, name: string): boolean {
  return flags.get(name) === true;
}

function requiredFlag(flags: Map<string, string | true>, name: string): string {
  const value = flagValue(flags, name);
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

function parseInteger(input: string, label: string): number {
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for ${label}: ${input}`);
  }
  return parsed;
}

function parseFloatStrict(input: string, label: string): number {
  const parsed = Number.parseFloat(input);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for ${label}: ${input}`);
  }
  return parsed;
}

function parsePublicKey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid public key for ${label}: ${value}`);
  }
}

function toScaled(value: number): anchor.BN {
  return new anchor.BN(Math.round(value * SCALE));
}

function toLtvBps(ltv: number): number {
  return Math.round(Math.max(0, Math.min(1, ltv)) * 10_000);
}

function deriveRiskStatePda(programId: PublicKey, lstId: string): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("risk"), Buffer.from(lstId)], programId)[0];
}

function deriveRegistryPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(ATTESTER_REGISTRY_SEED)], programId)[0];
}

function derivePendingUpdatePda(programId: PublicKey, lstId: string, roundId: number): PublicKey {
  const round = new anchor.BN(roundId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PENDING_UPDATE_SEED), Buffer.from(lstId), Buffer.from(round.toArrayLike(Buffer, "le", 8))],
    programId,
  )[0];
}

function deriveDisputePda(programId: PublicKey, lstId: string, roundId: number, attester: PublicKey): PublicKey {
  const round = new anchor.BN(roundId);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(DISPUTE_RECORD_SEED),
      Buffer.from(lstId),
      Buffer.from(round.toArrayLike(Buffer, "le", 8)),
      attester.toBuffer(),
    ],
    programId,
  )[0];
}

async function fetchNullable<T>(fetcher: () => Promise<T>): Promise<T | null> {
  try {
    return await fetcher();
  } catch {
    return null;
  }
}

function decodeRiskState(state: RiskStateAccount) {
  const timestamp = state.timestamp.toNumber();
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);

  return {
    lst_id: state.lstId,
    suggested_ltv: state.suggestedLtvBps / 10_000,
    suggested_ltv_bps: state.suggestedLtvBps,
    regime_flag: state.regimeFlag,
    theta: state.thetaScaled.toNumber() / SCALE,
    sigma: state.sigmaScaled.toNumber() / SCALE,
    z_score: state.zScoreScaled.toNumber() / SCALE,
    theta_scaled: state.thetaScaled.toString(),
    sigma_scaled: state.sigmaScaled.toString(),
    z_score_scaled: state.zScoreScaled.toString(),
    slot: state.slot.toString(),
    timestamp,
    age_seconds: ageSeconds,
    is_stale: timestamp > 0 ? ageSeconds > MAX_STALENESS_SECS : true,
    authority: state.authority.toBase58(),
    last_updater: state.lastUpdater.toBase58(),
    update_mode: state.updateMode === 1 ? "multi" : "single",
    attester_registry: state.attesterRegistry.toBase58(),
  };
}

function decodeRegistry(registry: RegistryAccount) {
  return {
    admin: registry.admin.toBase58(),
    attester_count: registry.attesterCount,
    threshold: registry.threshold,
    total_bonded_lamports: registry.totalBonded.toString(),
    total_bonded_sol: Number(registry.totalBonded.toString()) / LAMPORTS_PER_SOL,
    min_bond_lamports: registry.minBond.toString(),
    min_bond_sol: Number(registry.minBond.toString()) / LAMPORTS_PER_SOL,
    slash_destination: registry.slashDestination.toBase58(),
    attesters: registry.attesters
      .filter((entry) => entry.isActive)
      .map((entry) => ({
        pubkey: entry.pubkey.toBase58(),
        bond_lamports: entry.bond.toString(),
        bond_sol: Number(entry.bond.toString()) / LAMPORTS_PER_SOL,
        registered_at: entry.registeredAt.toString(),
        unregister_initiated_at: entry.unregisterInitiatedAt.toString(),
        updates_submitted: entry.updatesSubmitted.toString(),
        disputes_lost: entry.disputesLost.toString(),
      })),
  };
}

function decodePendingUpdate(pending: PendingUpdateAccount) {
  return {
    round_id: pending.roundId.toString(),
    lst_id: pending.lstId,
    proposer: pending.proposer.toBase58(),
    attester_registry: pending.attesterRegistry.toBase58(),
    proposed_at: pending.proposedAt.toString(),
    proposed_slot: pending.proposedSlot.toString(),
    expires_at: pending.expiresAt.toString(),
    confirmation_count: pending.confirmationCount,
    confirmations_bitmap: pending.confirmationsBitmap,
    is_finalized: pending.isFinalized,
    finalized_at: pending.finalizedAt.toString(),
    finalized_slot: pending.finalizedSlot.toString(),
    params: {
      theta: pending.params.thetaScaled.toNumber() / SCALE,
      sigma: pending.params.sigmaScaled.toNumber() / SCALE,
      regime_flag: pending.params.regimeFlag,
      suggested_ltv: pending.params.suggestedLtvBps / 10_000,
      suggested_ltv_bps: pending.params.suggestedLtvBps,
      z_score: pending.params.zScoreScaled.toNumber() / SCALE,
    },
  };
}

function decodeDispute(dispute: DisputeRecordAccount) {
  return {
    lst_id: dispute.lstId,
    disputed_slot: dispute.disputedSlot.toString(),
    finalized_slot: dispute.finalizedSlot.toString(),
    disputed_attester: dispute.disputedAttester.toBase58(),
    disputer: dispute.disputer.toBase58(),
    evidence_hash_hex: Buffer.from(dispute.evidenceHash).toString("hex"),
    filed_at: dispute.filedAt.toString(),
    resolution_deadline: dispute.resolutionDeadline.toString(),
    is_resolved: dispute.isResolved,
    attester_slashed: dispute.attesterSlashed,
    slash_amount_lamports: dispute.slashAmount.toString(),
    disputer_reward_lamports: dispute.disputerReward.toString(),
    disputed_params: {
      theta: dispute.disputedThetaScaled.toNumber() / SCALE,
      sigma: dispute.disputedSigmaScaled.toNumber() / SCALE,
      regime_flag: dispute.disputedRegimeFlag,
      suggested_ltv: dispute.disputedLtvBps / 10_000,
      suggested_ltv_bps: dispute.disputedLtvBps,
      z_score: dispute.disputedZScoreScaled.toNumber() / SCALE,
    },
  };
}

function discoverLstIds(): string[] {
  const artifactsDir = path.resolve(REPO_ROOT, "artifacts");
  if (!fs.existsSync(artifactsDir)) {
    return DEFAULT_LSTS;
  }

  const discovered = fs
    .readdirSync(artifactsDir)
    .filter((entry) => entry.startsWith("oracle_state.") && entry.endsWith(".json") && entry !== "oracle_state.json")
    .map((entry) => entry.replace("oracle_state.", "").replace(".json", ""))
    .sort();

  return discovered.length > 0 ? discovered : DEFAULT_LSTS;
}

function loadRiskPayload(payloadPath: string): RiskPayload {
  const resolved = resolveRepoPath(payloadPath);
  return JSON.parse(fs.readFileSync(resolved, "utf-8")) as RiskPayload;
}

function resolvePayload(args: ReturnType<typeof parseArgs>, positionalIndex = 0): { payload: RiskPayload; payloadPath: string } {
  const payloadPath = flagValue(args.flags, "payload") ?? args.positional[positionalIndex];
  if (!payloadPath) {
    throw new Error("Provide a payload path positionally or with --payload");
  }
  return { payload: loadRiskPayload(payloadPath), payloadPath: resolveRepoPath(payloadPath) };
}

function parseEvidence(input: string): number[] {
  const normalized = input.startsWith("0x") ? input.slice(2) : input;
  if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
    return [...Buffer.from(normalized, "hex")];
  }
  return [...createHash("sha256").update(input).digest()];
}

function loadArtifactHistory(lstId: string) {
  const candidates = [
    path.resolve(REPO_ROOT, "artifacts", `oracle_state.${lstId}.json`),
    path.resolve(REPO_ROOT, "artifacts", "oracle_state.json"),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const payload = JSON.parse(fs.readFileSync(candidate, "utf-8")) as OracleSnapshot & {
      lst_id?: string;
      history?: Array<{ timestamp: number; asset_price?: number; sol_price?: number; peg_deviation_pct?: number }>;
      history_source?: string;
    };
    if (candidate.endsWith("oracle_state.json") && payload.lst_id && payload.lst_id !== lstId) {
      continue;
    }
    return payload;
  }

  throw new Error(`No artifact snapshot found for ${lstId}`);
}

async function commandInitOracle(args: ReturnType<typeof parseArgs>) {
  const { wallet, program } = getContext();
  const lstId = args.positional[0] ?? "mSOL-v2";
  const authorityArg = flagValue(args.flags, "authority") ?? process.env.ORACLE_AUTHORITY ?? wallet.publicKey.toBase58();
  const authority = parsePublicKey(authorityArg, "authority");
  const riskState = deriveRiskStatePda(program.programId, lstId);

  const tx = await program.methods
    .initializeOracle(lstId, authority)
    .accounts({
      riskState,
      payer: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(JSON.stringify({ status: "initialized", lst_id: lstId, authority: authority.toBase58(), risk_state: riskState.toBase58(), tx }, null, 2));
}

async function commandInitRegistry(args: ReturnType<typeof parseArgs>) {
  const { wallet, program } = getContext();
  const threshold = parseInteger(flagValue(args.flags, "threshold") ?? "2", "threshold");
  const minBondSol = flagValue(args.flags, "min-bond-sol");
  const minBondLamports = flagValue(args.flags, "min-bond-lamports");
  const minBond = minBondLamports
    ? parseInteger(minBondLamports, "min-bond-lamports")
    : Math.round(parseFloatStrict(minBondSol ?? "1", "min-bond-sol") * LAMPORTS_PER_SOL);
  const slashDestination = parsePublicKey(
    flagValue(args.flags, "slash-destination") ?? wallet.publicKey.toBase58(),
    "slash-destination",
  );
  const registry = deriveRegistryPda(program.programId);

  const tx = await program.methods
    .initializeRegistry(threshold, new anchor.BN(minBond))
    .accounts({
      registry,
      admin: wallet.publicKey,
      slashDestination,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(JSON.stringify({ status: "initialized", registry: registry.toBase58(), threshold, min_bond_lamports: minBond, slash_destination: slashDestination.toBase58(), tx }, null, 2));
}

async function commandEnableMulti(args: ReturnType<typeof parseArgs>) {
  const { wallet, program } = getContext();
  const lstId = args.positional[0] ?? "mSOL-v2";
  const riskState = deriveRiskStatePda(program.programId, lstId);
  const registry = deriveRegistryPda(program.programId);

  const tx = await program.methods
    .enableMultiAttester(lstId)
    .accounts({
      riskState,
      registry,
      authority: wallet.publicKey,
    })
    .rpc();

  console.log(JSON.stringify({ status: "multi_attester_enabled", lst_id: lstId, risk_state: riskState.toBase58(), registry: registry.toBase58(), tx }, null, 2));
}

async function commandRegister(args: ReturnType<typeof parseArgs>) {
  const { wallet, program } = getContext();
  const bondSol = flagValue(args.flags, "bond-sol");
  const bondLamports = flagValue(args.flags, "bond-lamports");
  const bond = bondLamports
    ? parseInteger(bondLamports, "bond-lamports")
    : Math.round(parseFloatStrict(bondSol ?? "1", "bond-sol") * LAMPORTS_PER_SOL);
  const registry = deriveRegistryPda(program.programId);

  const tx = await program.methods
    .registerAttester(new anchor.BN(bond))
    .accounts({
      registry,
      attester: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(JSON.stringify({ status: "registered", attester: wallet.publicKey.toBase58(), registry: registry.toBase58(), bond_lamports: bond, tx }, null, 2));
}

async function commandUnregister() {
  const { wallet, program } = getContext();
  const registry = deriveRegistryPda(program.programId);

  const tx = await program.methods
    .initiateUnregister()
    .accounts({
      registry,
      attester: wallet.publicKey,
    })
    .rpc();

  console.log(JSON.stringify({ status: "cooldown_started", attester: wallet.publicKey.toBase58(), registry: registry.toBase58(), tx }, null, 2));
}

async function commandWithdraw() {
  const { wallet, program } = getContext();
  const registry = deriveRegistryPda(program.programId);

  const tx = await program.methods
    .withdrawBond()
    .accounts({
      registry,
      attester: wallet.publicKey,
    })
    .rpc();

  console.log(JSON.stringify({ status: "bond_withdrawn", attester: wallet.publicKey.toBase58(), registry: registry.toBase58(), tx }, null, 2));
}

async function commandSubmit(args: ReturnType<typeof parseArgs>) {
  const { wallet, program } = getContext();
  const { payload, payloadPath } = resolvePayload(args);
  const riskState = deriveRiskStatePda(program.programId, payload.lst_id);
  const suggestedLtvBps = toLtvBps(payload.suggested_ltv);

  const tx = await program.methods
    .updateRiskState({
      lstId: payload.lst_id,
      thetaScaled: toScaled(payload.theta),
      sigmaScaled: toScaled(payload.sigma),
      regimeFlag: payload.regime_flag,
      suggestedLtvBps,
      zScoreScaled: toScaled(payload.z_score),
    })
    .accounts({
      riskState,
      authority: wallet.publicKey,
    })
    .rpc();

  console.log(JSON.stringify({ status: "submitted", payload_path: payloadPath, lst_id: payload.lst_id, risk_state: riskState.toBase58(), tx }, null, 2));
}

function resolveProposedParams(args: ReturnType<typeof parseArgs>) {
  const payloadPath = flagValue(args.flags, "payload");
  if (payloadPath) {
    const payload = loadRiskPayload(payloadPath);
    return {
      lstId: payload.lst_id,
      theta: payload.theta,
      sigma: payload.sigma,
      regimeFlag: payload.regime_flag,
      suggestedLtv: payload.suggested_ltv,
      zScore: payload.z_score,
      payloadPath: resolveRepoPath(payloadPath),
    };
  }

  const lstId = args.positional[0];
  if (!lstId) {
    throw new Error("Provide an LST id or use --payload");
  }
  return {
    lstId,
    theta: parseFloatStrict(requiredFlag(args.flags, "theta"), "theta"),
    sigma: parseFloatStrict(requiredFlag(args.flags, "sigma"), "sigma"),
    regimeFlag: parseInteger(requiredFlag(args.flags, "regime"), "regime"),
    suggestedLtv: parseFloatStrict(requiredFlag(args.flags, "ltv"), "ltv"),
    zScore: parseFloatStrict(requiredFlag(args.flags, "z-score"), "z-score"),
    payloadPath: null,
  };
}

async function commandPropose(args: ReturnType<typeof parseArgs>) {
  const { wallet, program } = getContext();
  const round = parseInteger(requiredFlag(args.flags, "round"), "round");
  const params = resolveProposedParams(args);
  const riskState = deriveRiskStatePda(program.programId, params.lstId);
  const registry = deriveRegistryPda(program.programId);
  const pendingUpdate = derivePendingUpdatePda(program.programId, params.lstId, round);

  const tx = await program.methods
    .proposeUpdate(
      params.lstId,
      new anchor.BN(round),
      toScaled(params.theta),
      toScaled(params.sigma),
      params.regimeFlag,
      toLtvBps(params.suggestedLtv),
      toScaled(params.zScore),
    )
    .accounts({
      riskState,
      registry,
      pendingUpdate,
      proposer: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(JSON.stringify({ status: "proposed", lst_id: params.lstId, round_id: round, pending_update: pendingUpdate.toBase58(), payload_path: params.payloadPath, tx }, null, 2));
}

async function commandConfirm(args: ReturnType<typeof parseArgs>) {
  const { wallet, program } = getContext();
  const lstId = args.positional[0];
  if (!lstId) {
    throw new Error("Provide an LST id");
  }
  const round = parseInteger(requiredFlag(args.flags, "round"), "round");
  const riskState = deriveRiskStatePda(program.programId, lstId);
  const registry = deriveRegistryPda(program.programId);
  const pendingUpdate = derivePendingUpdatePda(program.programId, lstId, round);

  const tx = await program.methods
    .confirmUpdate(lstId, new anchor.BN(round))
    .accounts({
      riskState,
      registry,
      pendingUpdate,
      confirmer: wallet.publicKey,
    })
    .rpc();

  console.log(JSON.stringify({ status: "confirmed", lst_id: lstId, round_id: round, pending_update: pendingUpdate.toBase58(), tx }, null, 2));
}

async function commandCancel(args: ReturnType<typeof parseArgs>) {
  const { wallet, program } = getContext();
  const lstId = args.positional[0];
  if (!lstId) {
    throw new Error("Provide an LST id");
  }
  const round = parseInteger(requiredFlag(args.flags, "round"), "round");
  const pendingUpdate = derivePendingUpdatePda(program.programId, lstId, round);
  const pending = await program.account.pendingUpdate.fetch(pendingUpdate) as PendingUpdateAccount;

  const tx = await program.methods
    .cancelExpired(lstId, new anchor.BN(round))
    .accounts({
      pendingUpdate,
      refundRecipient: pending.proposer,
      caller: wallet.publicKey,
    })
    .rpc();

  console.log(JSON.stringify({ status: "cancelled", lst_id: lstId, round_id: round, refund_recipient: pending.proposer.toBase58(), tx }, null, 2));
}

async function commandDispute(args: ReturnType<typeof parseArgs>) {
  const { wallet, program } = getContext();
  const lstId = args.positional[0];
  if (!lstId) {
    throw new Error("Provide an LST id");
  }
  const round = parseInteger(requiredFlag(args.flags, "round"), "round");
  const attester = parsePublicKey(requiredFlag(args.flags, "attester"), "attester");
  const evidence = parseEvidence(requiredFlag(args.flags, "evidence"));
  const registry = deriveRegistryPda(program.programId);
  const pendingUpdate = derivePendingUpdatePda(program.programId, lstId, round);
  const disputeRecord = deriveDisputePda(program.programId, lstId, round, attester);

  const tx = await program.methods
    .disputeUpdate(lstId, new anchor.BN(round), attester, evidence)
    .accounts({
      disputer: wallet.publicKey,
      registry,
      pendingUpdate,
      disputeRecord,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(JSON.stringify({ status: "disputed", lst_id: lstId, round_id: round, disputed_attester: attester.toBase58(), dispute_record: disputeRecord.toBase58(), tx }, null, 2));
}

async function commandResolve(args: ReturnType<typeof parseArgs>) {
  const { wallet, program } = getContext();
  const lstId = args.positional[0];
  if (!lstId) {
    throw new Error("Provide an LST id");
  }
  const round = parseInteger(requiredFlag(args.flags, "round"), "round");
  const attester = parsePublicKey(requiredFlag(args.flags, "attester"), "attester");
  const disputer = parsePublicKey(requiredFlag(args.flags, "disputer"), "disputer");
  const registry = deriveRegistryPda(program.programId);
  const registryAccount = await program.account.attesterRegistry.fetch(registry) as RegistryAccount;
  const disputeRecord = deriveDisputePda(program.programId, lstId, round, attester);
  const slashDestination = parsePublicKey(
    flagValue(args.flags, "slash-destination") ?? registryAccount.slashDestination.toBase58(),
    "slash-destination",
  );
  const slashAttester = !flagBoolean(args.flags, "reject");

  const tx = await program.methods
    .resolveDispute(lstId, new anchor.BN(round), attester, slashAttester)
    .accounts({
      admin: wallet.publicKey,
      registry,
      disputeRecord,
      disputer,
      slashDestination,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(JSON.stringify({ status: slashAttester ? "resolved_and_slashed" : "resolved_without_slash", lst_id: lstId, round_id: round, dispute_record: disputeRecord.toBase58(), tx }, null, 2));
}

async function commandRead(args: ReturnType<typeof parseArgs>) {
  const { program } = getContext();
  const lstIds = flagBoolean(args.flags, "all") ? discoverLstIds() : [args.positional[0] ?? "mSOL-v2"];
  const result = [];

  for (const lstId of lstIds) {
    const riskStatePda = deriveRiskStatePda(program.programId, lstId);
    const state = await fetchNullable(() => program.account.riskState.fetch(riskStatePda)) as RiskStateAccount | null;
    if (!state) {
      result.push({ lst_id: lstId, risk_state: riskStatePda.toBase58(), status: "missing" });
      continue;
    }

    result.push({ lst_id: lstId, risk_state: riskStatePda.toBase58(), status: "ok", state: decodeRiskState(state) });
  }

  console.log(JSON.stringify(flagBoolean(args.flags, "all") ? { items: result } : result[0], null, 2));
}

async function commandRegistry() {
  const { program } = getContext();
  const registryPda = deriveRegistryPda(program.programId);
  const registry = await fetchNullable(() => program.account.attesterRegistry.fetch(registryPda)) as RegistryAccount | null;

  console.log(
    JSON.stringify(
      registry
        ? { status: "ok", registry: registryPda.toBase58(), account: decodeRegistry(registry) }
        : { status: "missing", registry: registryPda.toBase58() },
      null,
      2,
    ),
  );
}

async function commandPending(args: ReturnType<typeof parseArgs>) {
  const { program } = getContext();
  const lstId = args.positional[0];
  if (!lstId) {
    throw new Error("Provide an LST id");
  }
  const round = parseInteger(requiredFlag(args.flags, "round"), "round");
  const pendingUpdate = derivePendingUpdatePda(program.programId, lstId, round);
  const pending = await fetchNullable(() => program.account.pendingUpdate.fetch(pendingUpdate)) as PendingUpdateAccount | null;

  console.log(
    JSON.stringify(
      pending
        ? { status: "ok", pending_update: pendingUpdate.toBase58(), account: decodePendingUpdate(pending) }
        : { status: "missing", pending_update: pendingUpdate.toBase58() },
      null,
      2,
    ),
  );
}

async function commandDisputeStatus(args: ReturnType<typeof parseArgs>) {
  const { program } = getContext();
  const lstId = args.positional[0];
  if (!lstId) {
    throw new Error("Provide an LST id");
  }
  const round = parseInteger(requiredFlag(args.flags, "round"), "round");
  const attester = parsePublicKey(requiredFlag(args.flags, "attester"), "attester");
  const disputeRecord = deriveDisputePda(program.programId, lstId, round, attester);
  const dispute = await fetchNullable(() => program.account.disputeRecord.fetch(disputeRecord)) as DisputeRecordAccount | null;

  console.log(
    JSON.stringify(
      dispute
        ? { status: "ok", dispute_record: disputeRecord.toBase58(), account: decodeDispute(dispute) }
        : { status: "missing", dispute_record: disputeRecord.toBase58() },
      null,
      2,
    ),
  );
}

async function commandStatus(args: ReturnType<typeof parseArgs>) {
  const { program } = getContext();
  const lstId = args.positional[0] ?? "mSOL-v2";
  const riskStatePda = deriveRiskStatePda(program.programId, lstId);
  const registryPda = deriveRegistryPda(program.programId);
  const riskState = await fetchNullable(() => program.account.riskState.fetch(riskStatePda)) as RiskStateAccount | null;
  const registry = await fetchNullable(() => program.account.attesterRegistry.fetch(registryPda)) as RegistryAccount | null;

  console.log(
    JSON.stringify(
      {
        lst_id: lstId,
        risk_state: riskStatePda.toBase58(),
        registry: registryPda.toBase58(),
        oracle: riskState ? decodeRiskState(riskState) : null,
        registry_account: registry ? decodeRegistry(registry) : null,
      },
      null,
      2,
    ),
  );
}

async function commandMultiStatus(args: ReturnType<typeof parseArgs>) {
  const { program } = getContext();
  const lstId = args.positional[0] ?? "mSOL-v2";
  const roundFlag = flagValue(args.flags, "round");
  const riskStatePda = deriveRiskStatePda(program.programId, lstId);
  const registryPda = deriveRegistryPda(program.programId);
  const riskState = await fetchNullable(() => program.account.riskState.fetch(riskStatePda)) as RiskStateAccount | null;
  const registry = await fetchNullable(() => program.account.attesterRegistry.fetch(registryPda)) as RegistryAccount | null;
  const oracle = riskState ? decodeRiskState(riskState) : null;
  const registryAccount = registry ? decodeRegistry(registry) : null;

  let pendingUpdate: PublicKey | null = null;
  let pendingAccount: ReturnType<typeof decodePendingUpdate> | null = null;
  if (roundFlag) {
    const round = parseInteger(roundFlag, "round");
    pendingUpdate = derivePendingUpdatePda(program.programId, lstId, round);
    const pending = await fetchNullable(() => program.account.pendingUpdate.fetch(pendingUpdate!)) as PendingUpdateAccount | null;
    pendingAccount = pending ? decodePendingUpdate(pending) : null;
  }

  const readiness = evaluateMultiAttesterReadiness({
    oracle,
    registry: registryAccount,
    pending: pendingAccount,
  });

  console.log(
    JSON.stringify(
      {
        lst_id: lstId,
        ready: readiness.ready,
        blockers: readiness.blockers,
        warnings: readiness.warnings,
        risk_state: riskStatePda.toBase58(),
        registry: registryPda.toBase58(),
        pending_update: pendingUpdate?.toBase58() ?? null,
        oracle,
        registry_account: registryAccount,
        pending_account: pendingAccount,
      },
      null,
      2,
    ),
  );
}

async function commandHistory(args: ReturnType<typeof parseArgs>) {
  const lstId = args.positional[0] ?? "mSOL-v2";
  const days = parseInteger(flagValue(args.flags, "days") ?? "7", "days");
  const snapshot = loadArtifactHistory(lstId);
  const history = snapshot.history ?? [];
  const cutoff = history.length > 0 ? history[history.length - 1].timestamp - days * 24 * 60 * 60 : 0;
  const filtered = history.filter((row) => row.timestamp >= cutoff);

  console.log(
    JSON.stringify(
      {
        lst_id: lstId,
        history_source: snapshot.history_source ?? "unknown",
        points: filtered.length,
        rows: filtered,
      },
      null,
      2,
    ),
  );
}

async function commandSnapshotStatus(args: ReturnType<typeof parseArgs>) {
  const lstIds = flagBoolean(args.flags, "all") ? discoverLstIds() : [args.positional[0] ?? "mSOL-v2"];
  const items = lstIds.map((lstId) => buildArtifactStatus(loadArtifactHistory(lstId)));
  console.log(JSON.stringify(flagBoolean(args.flags, "all") ? { items } : items[0], null, 2));
}

function printHelp() {
  console.log(`PegShield CLI

Usage:
  pegshield <command> [args] [--flags]

Commands:
  init-oracle <lst-id> [--authority <pubkey>]
  init-registry [--threshold 2] [--min-bond-sol 1] [--slash-destination <pubkey>]
  enable-multi <lst-id>
  register [--bond-sol 1.5 | --bond-lamports 1500000000]
  unregister
  withdraw
  submit --payload <core-engine-output.json>
  propose <lst-id> --round <n> --theta <v> --sigma <v> --regime <0|1> --ltv <0-1> --z-score <v>
  propose --payload <core-engine-output.json> --round <n>
  confirm <lst-id> --round <n>
  cancel <lst-id> --round <n>
  read <lst-id>
  read --all
  registry
  pending <lst-id> --round <n>
  dispute-status <lst-id> --round <n> --attester <pubkey>
  status [lst-id]
  multi-status [lst-id] [--round <n>]
  snapshot-status [lst-id]
  snapshot-status --all
  history [lst-id] [--days 7]
  dispute <lst-id> --round <n> --attester <pubkey> --evidence <hex-or-string>
  resolve <lst-id> --round <n> --attester <pubkey> --disputer <pubkey> [--reject]
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    case "init-oracle":
      await commandInitOracle(args);
      return;
    case "init-registry":
      await commandInitRegistry(args);
      return;
    case "enable-multi":
      await commandEnableMulti(args);
      return;
    case "register":
      await commandRegister(args);
      return;
    case "unregister":
      await commandUnregister();
      return;
    case "withdraw":
      await commandWithdraw();
      return;
    case "submit":
      await commandSubmit(args);
      return;
    case "propose":
      await commandPropose(args);
      return;
    case "confirm":
      await commandConfirm(args);
      return;
    case "cancel":
      await commandCancel(args);
      return;
    case "read":
      await commandRead(args);
      return;
    case "registry":
      await commandRegistry();
      return;
    case "pending":
      await commandPending(args);
      return;
    case "dispute-status":
      await commandDisputeStatus(args);
      return;
    case "status":
      await commandStatus(args);
      return;
    case "multi-status":
      await commandMultiStatus(args);
      return;
    case "snapshot-status":
      await commandSnapshotStatus(args);
      return;
    case "history":
      await commandHistory(args);
      return;
    case "dispute":
      await commandDispute(args);
      return;
    case "resolve":
      await commandResolve(args);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
