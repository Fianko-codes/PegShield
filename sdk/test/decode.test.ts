/**
 * Basic decode round-trip test.
 *
 * Builds a synthetic `RiskState` buffer matching the on-chain layout, runs it
 * through `decodeRiskState`, and asserts every field. Also exercises
 * `deriveRiskStatePda` against the deployed devnet program id to guard against
 * accidental seed-prefix regressions.
 *
 * Run with: `npx ts-node test/decode.test.ts`
 */
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import {
  DEFAULT_LST_ID,
  DEFAULT_PROGRAM_ID,
  MAX_LTV_BPS,
  SCALE,
  decodeRiskState,
  deriveRiskStatePda,
  isCritical,
  isStale,
  safeLtv,
} from "../src";

function buildBuffer(): Buffer {
  const lstId = "mSOL-v2";
  const lstIdBytes = Buffer.from(lstId, "utf8");
  // 8 disc + 4 len + n + 8 + 8 + 1 + 2 + 8 + 8 + 8 + 32 + 32
  const size = 8 + 4 + lstIdBytes.length + 8 + 8 + 1 + 2 + 8 + 8 + 8 + 32 + 32;
  const buf = Buffer.alloc(size);
  let o = 0;

  // discriminator — opaque 8 bytes
  buf.write("\x78\x21\x3a\xec\xd2\xbf\x6a\x61", o, "binary");
  o += 8;

  buf.writeUInt32LE(lstIdBytes.length, o);
  o += 4;
  lstIdBytes.copy(buf, o);
  o += lstIdBytes.length;

  // theta_scaled = 199.000289 × SCALE
  buf.writeBigInt64LE(BigInt(Math.round(199.000289 * SCALE)), o);
  o += 8;
  // sigma_scaled = 0.018976 × SCALE
  buf.writeBigInt64LE(BigInt(Math.round(0.018976 * SCALE)), o);
  o += 8;
  // regime_flag = 0 (NORMAL)
  buf.writeUInt8(0, o);
  o += 1;
  // suggested_ltv_bps = 8000 (80%)
  buf.writeUInt16LE(8000, o);
  o += 2;
  // z_score_scaled = -0.0511 × SCALE
  buf.writeBigInt64LE(BigInt(Math.round(-0.0511 * SCALE)), o);
  o += 8;
  // slot
  buf.writeBigUInt64LE(455644682n, o);
  o += 8;
  // timestamp
  buf.writeBigInt64LE(1_776_236_494n, o);
  o += 8;
  // authority (fill with 0x11) and last_updater (0x22)
  buf.fill(0x11, o, o + 32);
  o += 32;
  buf.fill(0x22, o, o + 32);
  o += 32;

  return buf;
}

function main() {
  const buf = buildBuffer();
  const s = decodeRiskState(buf);

  assert.equal(s.lstId, "mSOL-v2", "lstId");
  assert.ok(Math.abs(s.theta - 199.000289) < 1e-6, "theta");
  assert.ok(Math.abs(s.sigma - 0.018976) < 1e-6, "sigma");
  assert.equal(s.regimeFlag, 0, "regimeFlag");
  assert.equal(s.suggestedLtvBps, 8000, "suggestedLtvBps");
  assert.equal(s.suggestedLtv, 0.8, "suggestedLtv");
  assert.ok(Math.abs(s.zScore - -0.0511) < 1e-6, "zScore");
  assert.equal(s.slot, 455644682n, "slot");
  assert.equal(s.timestamp, 1_776_236_494n, "timestamp");
  assert.equal(s.authority, new PublicKey(Buffer.alloc(32, 0x11)).toBase58());
  assert.equal(s.lastUpdater, new PublicKey(Buffer.alloc(32, 0x22)).toBase58());

  // Guards
  assert.equal(isCritical(s), false, "isCritical(NORMAL)");
  assert.equal(isStale(s, Number(s.timestamp) + 10), false, "fresh");
  assert.equal(isStale(s, Number(s.timestamp) + 1_000_000), true, "stale");
  assert.equal(
    safeLtv(s, { nowSec: Number(s.timestamp) + 10 }),
    0.8,
    "safeLtv fresh",
  );
  assert.equal(
    safeLtv(s, { nowSec: Number(s.timestamp) + 10, maxLtv: 0.6 }),
    0.6,
    "safeLtv clamp",
  );
  assert.equal(
    safeLtv(s, { nowSec: Number(s.timestamp) + 1_000_000 }),
    0.4,
    "safeLtv stale -> fallback",
  );

  // PDA derivation — must match the deployed devnet PDA
  const { address } = deriveRiskStatePda({
    lstId: DEFAULT_LST_ID,
    programId: DEFAULT_PROGRAM_ID,
  });
  assert.equal(
    address.toBase58(),
    "7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo",
    "PDA derivation matches deployed devnet address",
  );

  // LTV bounds sanity
  assert.equal(MAX_LTV_BPS, 10_000);

  console.log("all tests passed");
}

main();
