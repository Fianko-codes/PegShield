import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const REPO_ROOT = path.resolve(__dirname, "..");

/** Fixed-point scale: matches SCALE constant in lib.rs */
const SCALE = 1_000_000;

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

function loadWallet(): anchor.Wallet {
  const rawKeypair = JSON.parse(
    fs.readFileSync(resolveRepoPath(requiredEnv("UPDATER_KEYPAIR_PATH")), "utf-8"),
  ) as number[];
  return new anchor.Wallet(Keypair.fromSecretKey(Uint8Array.from(rawKeypair)));
}

async function main(): Promise<void> {
  const lstId = process.argv[2] ?? "mSOL";
  const connection = new Connection(requiredEnv("SOLANA_RPC_URL"), "confirmed");
  const idl = loadIdl();
  const wallet = loadWallet();
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  const program = new anchor.Program(idl as anchor.Idl, provider) as any;

  const [riskStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("risk"), Buffer.from(lstId)],
    program.programId,
  );

  const state = (await program.account.riskState.fetch(
    riskStatePda,
  )) as RiskStateAccount;

  // Decode fixed-point fields back to human-readable floats
  const theta = state.thetaScaled.toNumber() / SCALE;
  const sigma = state.sigmaScaled.toNumber() / SCALE;
  const z_score = state.zScoreScaled.toNumber() / SCALE;
  const suggested_ltv = state.suggestedLtvBps / 10_000;

  console.log(
    JSON.stringify(
      {
        risk_state: riskStatePda.toBase58(),
        lst_id: state.lstId,
        // Human-readable floats
        suggested_ltv,
        regime_flag: state.regimeFlag,
        theta,
        sigma,
        z_score,
        // Raw on-chain fixed-point values (for auditing)
        suggested_ltv_bps: state.suggestedLtvBps,
        theta_scaled: state.thetaScaled.toNumber(),
        sigma_scaled: state.sigmaScaled.toNumber(),
        z_score_scaled: state.zScoreScaled.toNumber(),
        slot: state.slot.toNumber(),
        timestamp: state.timestamp.toNumber(),
        authority: state.authority.toBase58(),
        last_updater: state.lastUpdater.toBase58(),
        update_mode: state.updateMode,
        attester_registry: state.attesterRegistry.toBase58(),
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
