import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const REPO_ROOT = path.resolve(__dirname, "..");

type RiskStateAccount = {
  lstId: string;
  suggestedLtv: number;
  regimeFlag: number;
  theta: number;
  sigma: number;
  zScore: number;
  authority: PublicKey;
  lastUpdater: PublicKey;
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

function loadWallet(): anchor.Wallet {
  const rawKeypair = JSON.parse(
    fs.readFileSync(resolveRepoPath(requiredEnv("UPDATER_KEYPAIR_PATH")), "utf-8"),
  ) as number[];
  return new anchor.Wallet(Keypair.fromSecretKey(Uint8Array.from(rawKeypair)));
}

async function main(): Promise<void> {
  const lstId = process.argv[2] ?? "mSOL";
  const connection = new Connection(requiredEnv("SOLANA_RPC_URL"), "confirmed");
  const idlPath = path.resolve(
    __dirname,
    "..",
    "solana-program",
    "target",
    "idl",
    "risk_oracle.json",
  );
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
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
  console.log(
    JSON.stringify(
      {
        risk_state: riskStatePda.toBase58(),
        lst_id: state.lstId,
        suggested_ltv: state.suggestedLtv,
        regime_flag: state.regimeFlag,
        theta: state.theta,
        sigma: state.sigma,
        z_score: state.zScore,
        authority: state.authority.toBase58(),
        last_updater: state.lastUpdater.toBase58(),
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
