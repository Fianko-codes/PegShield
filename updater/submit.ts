import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const REPO_ROOT = path.resolve(__dirname, "..");

/** Fixed-point scale: matches SCALE constant in lib.rs */
const SCALE = 1_000_000;

/** Pipeline outputs floats; this is what we read from latest.json */
type RiskPayload = {
  lst_id: string;
  theta: number;
  sigma: number;
  regime_flag: number;
  suggested_ltv: number; // 0.0–1.0
  z_score: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveRepoPath(targetPath: string): string {
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(REPO_ROOT, targetPath);
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

  throw new Error(
    `Unable to find risk_oracle IDL. Checked: ${candidatePaths.join(", ")}`,
  );
}

function loadRiskPayload(jsonPath: string): RiskPayload {
  return JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as RiskPayload;
}

/** Convert a float to a fixed-point i64 encoded as BN, clamped to safe range. */
function toScaled(value: number): anchor.BN {
  return new anchor.BN(Math.round(value * SCALE));
}

/** Convert suggested_ltv (0.0–1.0) to basis points (0–10_000). */
function toLtvBps(ltv: number): number {
  return Math.round(Math.max(0, Math.min(1, ltv)) * 10_000);
}

async function main(): Promise<void> {
  const jsonPath =
    process.argv[2] ??
    path.resolve(__dirname, "..", "core-engine", "output", "latest.json");

  const riskData = loadRiskPayload(jsonPath);
  const connection = new Connection(requiredEnv("SOLANA_RPC_URL"), "confirmed");
  const rawKeypair = JSON.parse(
    fs.readFileSync(resolveRepoPath(requiredEnv("UPDATER_KEYPAIR_PATH")), "utf-8"),
  ) as number[];
  const wallet = new anchor.Wallet(
    Keypair.fromSecretKey(Uint8Array.from(rawKeypair)),
  );
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  const idl = loadIdl();
  const program = new anchor.Program(idl as anchor.Idl, provider) as any;

  const [riskStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("risk"), Buffer.from(riskData.lst_id)],
    program.programId,
  );

  const suggestedLtvBps = toLtvBps(riskData.suggested_ltv);

  const tx = await program.methods
    .updateRiskState({
      lstId: riskData.lst_id,
      thetaScaled: toScaled(riskData.theta),
      sigmaScaled: toScaled(riskData.sigma),
      regimeFlag: riskData.regime_flag,
      suggestedLtvBps,
      zScoreScaled: toScaled(riskData.z_score),
    })
    .accounts({
      riskState: riskStatePda,
      authority: wallet.publicKey,
    })
    .rpc();

  console.log(
    JSON.stringify(
      {
        status: "submitted",
        lst_id: riskData.lst_id,
        suggested_ltv: riskData.suggested_ltv,
        suggested_ltv_bps: suggestedLtvBps,
        theta_scaled: riskData.theta * SCALE,
        sigma_scaled: riskData.sigma * SCALE,
        risk_state: riskStatePda.toBase58(),
        tx,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
