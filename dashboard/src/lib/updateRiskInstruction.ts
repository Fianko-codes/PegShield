import { Buffer } from 'buffer';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';

const SCALE = 1_000_000;
const UPDATE_RISK_STATE_DISCRIMINATOR = Uint8Array.from([71, 227, 24, 202, 12, 22, 17, 96]);

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function encodeString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, bytes.length, true);
  return concatBytes([length, bytes]);
}

function encodeU8(value: number): Uint8Array {
  return Uint8Array.of(value);
}

function encodeU16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function encodeI64(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, value, true);
  return bytes;
}

export function toScaledI64(value: number): bigint {
  return BigInt(Math.round(value * SCALE));
}

export function toLtvBps(value: number): number {
  return Math.round(value * 10_000);
}

export function encodeRiskParams(params: {
  lstId: string;
  theta: number;
  sigma: number;
  regimeFlag: number;
  suggestedLtv: number;
  zScore: number;
}): Uint8Array {
  return concatBytes([
    UPDATE_RISK_STATE_DISCRIMINATOR,
    encodeString(params.lstId),
    encodeI64(toScaledI64(params.theta)),
    encodeI64(toScaledI64(params.sigma)),
    encodeU8(params.regimeFlag),
    encodeU16(toLtvBps(params.suggestedLtv)),
    encodeI64(toScaledI64(params.zScore)),
  ]);
}

export function buildUpdateRiskStateInstruction(params: {
  authority: PublicKey;
  riskStatePda: string;
  programId: string;
  lstId: string;
  theta: number;
  sigma: number;
  regimeFlag: number;
  suggestedLtv: number;
  zScore: number;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(params.programId),
    keys: [
      {
        pubkey: new PublicKey(params.riskStatePda),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: params.authority,
        isSigner: true,
        isWritable: false,
      },
    ],
    data: Buffer.from(
      encodeRiskParams({
        lstId: params.lstId,
        theta: params.theta,
        sigma: params.sigma,
        regimeFlag: params.regimeFlag,
        suggestedLtv: params.suggestedLtv,
        zScore: params.zScore,
      }),
    ),
  });
}

export function isUnauthorizedOracleRejection(payload: string, logs: string[] = []): boolean {
  const joined = `${payload}\n${logs.join('\n')}`;
  return (
    joined.includes('Unauthorized authority') ||
    joined.includes('Error Code: Unauthorized') ||
    joined.includes('custom program error: 0x1770')
  );
}
