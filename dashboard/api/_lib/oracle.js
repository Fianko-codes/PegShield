import { Connection, PublicKey } from '@solana/web3.js';

const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';
const DEFAULT_PROGRAM_ID = 'DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea';
const DEFAULT_LST_ID = 'mSOL-v2';

/** Matches SCALE in lib.rs.  All i64 risk fields are multiplied by this. */
const SCALE = 1_000_000;

// ---------------------------------------------------------------------------
// Low-level buffer helpers — each returns the decoded value and the next offset
// ---------------------------------------------------------------------------

function readString(buffer, offset) {
  const length = buffer.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + length;
  return {
    value: buffer.subarray(start, end).toString('utf8'),
    offset: end,
  };
}

function readI64(buffer, offset) {
  // readBigInt64LE returns a BigInt; convert to Number.
  // Safe for our scaled values (max ~1e9 << Number.MAX_SAFE_INTEGER).
  return {
    value: Number(buffer.readBigInt64LE(offset)),
    offset: offset + 8,
  };
}

function readU8(buffer, offset) {
  return {
    value: buffer.readUInt8(offset),
    offset: offset + 1,
  };
}

function readU16(buffer, offset) {
  return {
    value: buffer.readUInt16LE(offset),
    offset: offset + 2,
  };
}

function readU64(buffer, offset) {
  return {
    value: Number(buffer.readBigUInt64LE(offset)),
    offset: offset + 8,
  };
}

function readPubkey(buffer, offset) {
  return {
    value: new PublicKey(buffer.subarray(offset, offset + 32)).toBase58(),
    offset: offset + 32,
  };
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function deriveRiskStateAddress(lstId = DEFAULT_LST_ID, programId = DEFAULT_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('risk'), Buffer.from(lstId)],
    new PublicKey(programId),
  )[0];
}

/**
 * Decode a RiskState account buffer into a plain object.
 *
 * On-chain layout (matches RiskState::SPACE in lib.rs):
 *   8   bytes  — Anchor discriminator (skipped)
 *   4+N bytes  — lst_id string (4-byte LE length prefix + N bytes data)
 *   8   bytes  — theta_scaled  i64
 *   8   bytes  — sigma_scaled  i64
 *   1   byte   — regime_flag   u8
 *   2   bytes  — suggested_ltv_bps u16
 *   8   bytes  — z_score_scaled i64
 *   8   bytes  — slot           u64
 *   8   bytes  — timestamp      i64
 *   32  bytes  — authority      Pubkey
 *   32  bytes  — last_updater   Pubkey
 */
export function decodeRiskStateAccount(data) {
  let offset = 8; // skip discriminator

  const lstId = readString(data, offset);
  offset = lstId.offset;

  const thetaScaled = readI64(data, offset);
  offset = thetaScaled.offset;

  const sigmaScaled = readI64(data, offset);
  offset = sigmaScaled.offset;

  const regimeFlag = readU8(data, offset);
  offset = regimeFlag.offset;

  const suggestedLtvBps = readU16(data, offset);
  offset = suggestedLtvBps.offset;

  const zScoreScaled = readI64(data, offset);
  offset = zScoreScaled.offset;

  const slot = readU64(data, offset);
  offset = slot.offset;

  const timestamp = readI64(data, offset);
  offset = timestamp.offset;

  const authority = readPubkey(data, offset);
  offset = authority.offset;

  const lastUpdater = readPubkey(data, offset);

  // Decode fixed-point back to floats for API consumers
  const theta = Number((thetaScaled.value / SCALE).toFixed(6));
  const sigma = Number((sigmaScaled.value / SCALE).toFixed(6));
  const z_score = Number((zScoreScaled.value / SCALE).toFixed(4));
  const suggested_ltv = Number((suggestedLtvBps.value / 10_000).toFixed(4));

  return {
    lst_id: lstId.value,
    // Human-readable floats (primary API surface)
    theta,
    sigma,
    regime_flag: regimeFlag.value,
    suggested_ltv,
    z_score,
    // Raw on-chain fixed-point (for auditing / verifying no rounding loss)
    theta_scaled: thetaScaled.value,
    sigma_scaled: sigmaScaled.value,
    suggested_ltv_bps: suggestedLtvBps.value,
    z_score_scaled: zScoreScaled.value,
    slot: slot.value,
    timestamp: timestamp.value,
    authority: authority.value,
    last_updater: lastUpdater.value,
  };
}

export async function fetchOracleState({
  rpcUrl = process.env.SOLANA_RPC_URL || DEFAULT_RPC_URL,
  programId = process.env.PROGRAM_ID || DEFAULT_PROGRAM_ID,
  lstId = process.env.ORACLE_LST_ID || DEFAULT_LST_ID,
} = {}) {
  const connection = new Connection(rpcUrl, 'confirmed');
  const riskStateAddress = deriveRiskStateAddress(lstId, programId);
  const accountInfo = await connection.getAccountInfo(riskStateAddress, 'confirmed');

  if (!accountInfo) {
    throw new Error(`Risk state account not found for ${lstId}`);
  }

  if (!accountInfo.owner.equals(new PublicKey(programId))) {
    throw new Error('Risk state account owner mismatch');
  }

  const decoded = decodeRiskStateAccount(Buffer.from(accountInfo.data));
  return {
    ...decoded,
    risk_state: riskStateAddress.toBase58(),
    program_id: programId,
    network: rpcUrl.includes('devnet') ? 'solana-devnet' : 'solana-custom',
  };
}
