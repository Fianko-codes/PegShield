import { Connection, PublicKey } from "@solana/web3.js";
import { DEFAULT_LST_ID, DEFAULT_PROGRAM_ID } from "./constants";
import { decodeRiskState } from "./decode";
import { deriveRiskStatePda } from "./pda";
import type { RiskState } from "./types";

export interface FetchRiskStateOptions {
  lstId?: string;
  programId?: string | PublicKey;
  commitment?: "processed" | "confirmed" | "finalized";
}

export interface FetchedRiskState {
  state: RiskState;
  /** The resolved PDA address of the `RiskState`. */
  address: PublicKey;
  /** The program id the account is owned by. */
  programId: PublicKey;
}

/**
 * Fetch and decode the on-chain `RiskState` PDA.
 *
 * Throws if the account does not exist or is owned by a different program.
 * Consumers should additionally check staleness (`isStale`) and regime (`isCritical`)
 * before using `suggestedLtv` to authorise new borrow.
 */
export async function fetchRiskState(
  connection: Connection,
  options: FetchRiskStateOptions = {},
): Promise<FetchedRiskState> {
  const programId =
    options.programId instanceof PublicKey
      ? options.programId
      : new PublicKey(options.programId ?? DEFAULT_PROGRAM_ID);

  const { address } = deriveRiskStatePda({
    lstId: options.lstId ?? DEFAULT_LST_ID,
    programId,
  });

  const accountInfo = await connection.getAccountInfo(
    address,
    options.commitment ?? "confirmed",
  );
  if (!accountInfo) {
    throw new Error(
      `PegShield: RiskState not found at ${address.toBase58()} (lst_id=${
        options.lstId ?? DEFAULT_LST_ID
      })`,
    );
  }
  if (!accountInfo.owner.equals(programId)) {
    throw new Error(
      `PegShield: RiskState owner mismatch — expected ${programId.toBase58()}, got ${accountInfo.owner.toBase58()}`,
    );
  }

  return {
    state: decodeRiskState(accountInfo.data),
    address,
    programId,
  };
}
