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

async function main(): Promise<void> {
  const collateralValueUsd = Number(process.argv[2] ?? "1000");
  const lstId = process.argv[3] ?? "mSOL";
  const fixedLtv = 0.8;

  const connection = new Connection(requiredEnv("SOLANA_RPC_URL"), "confirmed");
  const wallet = loadWallet();
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  const program = new anchor.Program(loadIdl(), provider) as any;

  const [riskStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("risk"), Buffer.from(lstId)],
    program.programId,
  );

  const state = (await program.account.riskState.fetch(
    riskStatePda,
  )) as RiskStateAccount;

  const fixedBorrowLimit = collateralValueUsd * fixedLtv;
  const oracleBorrowLimit = collateralValueUsd * state.suggestedLtv;

  console.log(
    JSON.stringify(
      {
        lst_id: state.lstId,
        collateral_value_usd: collateralValueUsd,
        fixed_ltv: fixedLtv,
        oracle_ltv: state.suggestedLtv,
        fixed_borrow_limit_usd: Number(fixedBorrowLimit.toFixed(2)),
        oracle_borrow_limit_usd: Number(oracleBorrowLimit.toFixed(2)),
        borrow_limit_delta_usd: Number((fixedBorrowLimit - oracleBorrowLimit).toFixed(2)),
        regime_flag: state.regimeFlag,
        theta: state.theta,
        sigma: state.sigma,
        z_score: state.zScore,
        risk_state: riskStatePda.toBase58(),
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
