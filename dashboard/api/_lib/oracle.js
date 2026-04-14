import { Connection, PublicKey } from '@solana/web3.js';

const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';
const DEFAULT_PROGRAM_ID = 'DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea';
const DEFAULT_LST_ID = 'mSOL';

function readString(buffer, offset) {
  const length = buffer.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + length;
  return {
    value: buffer.subarray(start, end).toString('utf8'),
    offset: end,
  };
}

function readF64(buffer, offset) {
  return {
    value: buffer.readDoubleLE(offset),
    offset: offset + 8,
  };
}

function readU8(buffer, offset) {
  return {
    value: buffer.readUInt8(offset),
    offset: offset + 1,
  };
}

function readU64(buffer, offset) {
  return {
    value: Number(buffer.readBigUInt64LE(offset)),
    offset: offset + 8,
  };
}

function readI64(buffer, offset) {
  return {
    value: Number(buffer.readBigInt64LE(offset)),
    offset: offset + 8,
  };
}

function readPubkey(buffer, offset) {
  return {
    value: new PublicKey(buffer.subarray(offset, offset + 32)).toBase58(),
    offset: offset + 32,
  };
}

export function deriveRiskStateAddress(lstId = DEFAULT_LST_ID, programId = DEFAULT_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('risk'), Buffer.from(lstId)],
    new PublicKey(programId),
  )[0];
}

export function decodeRiskStateAccount(data) {
  let offset = 8;

  const lstId = readString(data, offset);
  offset = lstId.offset;

  const theta = readF64(data, offset);
  offset = theta.offset;

  const sigma = readF64(data, offset);
  offset = sigma.offset;

  const regimeFlag = readU8(data, offset);
  offset = regimeFlag.offset;

  const suggestedLtv = readF64(data, offset);
  offset = suggestedLtv.offset;

  const zScore = readF64(data, offset);
  offset = zScore.offset;

  const slot = readU64(data, offset);
  offset = slot.offset;

  const timestamp = readI64(data, offset);
  offset = timestamp.offset;

  const authority = readPubkey(data, offset);
  offset = authority.offset;

  const lastUpdater = readPubkey(data, offset);

  return {
    lst_id: lstId.value,
    theta: Number(theta.value.toFixed(6)),
    sigma: Number(sigma.value.toFixed(6)),
    regime_flag: regimeFlag.value,
    suggested_ltv: Number(suggestedLtv.value.toFixed(4)),
    z_score: Number(zScore.value.toFixed(4)),
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

