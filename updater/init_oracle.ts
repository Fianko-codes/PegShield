import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const REPO_ROOT = path.resolve(__dirname, "..");

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
  const lstId = process.argv[2] ?? "mSOL-v2";
  const authority = new PublicKey(requiredEnv("ORACLE_AUTHORITY"));
  const connection = new Connection(requiredEnv("SOLANA_RPC_URL"), "confirmed");
  const wallet = loadWallet();
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  const idl = loadIdl();
  const program = new anchor.Program(idl as anchor.Idl, provider) as any;

  const [riskStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("risk"), Buffer.from(lstId)],
    program.programId,
  );

  const tx = await program.methods
    .initializeOracle(lstId, authority)
    .accounts({
      riskState: riskStatePda,
      payer: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log(
    JSON.stringify(
      {
        status: "initialized",
        lst_id: lstId,
        authority: authority.toBase58(),
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
