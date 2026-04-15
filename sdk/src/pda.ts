import { PublicKey } from "@solana/web3.js";
import { DEFAULT_LST_ID, DEFAULT_PROGRAM_ID, RISK_STATE_SEED } from "./constants";

export interface DeriveRiskStatePdaArgs {
  lstId?: string;
  programId?: string | PublicKey;
}

/**
 * Derive the `RiskState` PDA for a given LST id.
 * Defaults: `lstId = "mSOL-v2"`, `programId = DMR3rXBh...` (devnet deployment).
 */
export function deriveRiskStatePda(args: DeriveRiskStatePdaArgs = {}): {
  address: PublicKey;
  bump: number;
} {
  const lstId = args.lstId ?? DEFAULT_LST_ID;
  const programId =
    args.programId instanceof PublicKey
      ? args.programId
      : new PublicKey(args.programId ?? DEFAULT_PROGRAM_ID);

  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(RISK_STATE_SEED), Buffer.from(lstId)],
    programId,
  );
  return { address, bump };
}
