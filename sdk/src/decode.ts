import { PublicKey } from "@solana/web3.js";
import { SCALE } from "./constants";
import type { RegimeFlag, RiskState } from "./types";

/**
 * Decode a raw `RiskState` account buffer into a typed `RiskState`.
 *
 * On-chain layout (matches `RiskState::SPACE` in `lib.rs`):
 * ```
 *    8  bytes  — Anchor discriminator (skipped)
 *  4+N  bytes  — lst_id string (4-byte LE length prefix + N bytes UTF-8)
 *    8  bytes  — theta_scaled       i64
 *    8  bytes  — sigma_scaled       i64
 *    1  byte   — regime_flag        u8
 *    2  bytes  — suggested_ltv_bps  u16
 *    8  bytes  — z_score_scaled     i64
 *    8  bytes  — slot               u64
 *    8  bytes  — timestamp          i64
 *   32  bytes  — authority          Pubkey
 *   32  bytes  — last_updater       Pubkey
 * ```
 */
export function decodeRiskState(data: Uint8Array | Buffer): RiskState {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  let offset = 8; // skip 8-byte discriminator

  const lstIdLen = buf.readUInt32LE(offset);
  offset += 4;
  const lstId = buf.subarray(offset, offset + lstIdLen).toString("utf8");
  offset += lstIdLen;

  const thetaScaled = buf.readBigInt64LE(offset);
  offset += 8;

  const sigmaScaled = buf.readBigInt64LE(offset);
  offset += 8;

  const regimeFlagRaw = buf.readUInt8(offset);
  offset += 1;

  const suggestedLtvBps = buf.readUInt16LE(offset);
  offset += 2;

  const zScoreScaled = buf.readBigInt64LE(offset);
  offset += 8;

  const slot = buf.readBigUInt64LE(offset);
  offset += 8;

  const timestamp = buf.readBigInt64LE(offset);
  offset += 8;

  const authority = new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const lastUpdater = new PublicKey(buf.subarray(offset, offset + 32)).toBase58();

  return {
    lstId,
    theta: Number(thetaScaled) / SCALE,
    sigma: Number(sigmaScaled) / SCALE,
    zScore: Number(zScoreScaled) / SCALE,
    suggestedLtv: suggestedLtvBps / 10_000,
    thetaScaled,
    sigmaScaled,
    zScoreScaled,
    suggestedLtvBps,
    regimeFlag: (regimeFlagRaw === 1 ? 1 : 0) as RegimeFlag,
    slot,
    timestamp,
    authority,
    lastUpdater,
  };
}
