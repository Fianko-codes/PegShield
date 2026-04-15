import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

const SCALE = 1_000_000;

function toScaled(value: number): anchor.BN {
  return new anchor.BN(Math.round(value * SCALE));
}

function toLtvBps(ltv: number): number {
  return Math.round(ltv * 10_000);
}

describe("risk-oracle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program: any = anchor.workspace.RiskOracle;
  const lstId = "mSOL";

  const [riskStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("risk"), Buffer.from(lstId)],
    program.programId,
  );

  const validParams = {
    lstId,
    thetaScaled: toScaled(0.045),
    sigmaScaled: toScaled(0.012),
    regimeFlag: 0,
    suggestedLtvBps: toLtvBps(0.75),
    zScoreScaled: toScaled(-0.82),
  };

  it("initializes a risk state PDA with zeroed fields", async () => {
    await program.methods
      .initializeOracle(lstId, provider.wallet.publicKey)
      .accounts({
        riskState: riskStatePda,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const state = await (program.account as any).riskState.fetch(riskStatePda);
    assert.equal(state.lstId, lstId);
    assert.equal(state.thetaScaled.toNumber(), 0);
    assert.equal(state.sigmaScaled.toNumber(), 0);
    assert.equal(state.suggestedLtvBps, 0);
    assert.equal(state.regimeFlag, 0);
    assert.equal(
      state.authority.toBase58(),
      provider.wallet.publicKey.toBase58(),
    );
    // timestamp == 0 means "never updated"
    assert.equal(state.timestamp.toNumber(), 0);
  });

  it("accepts a valid update and decodes fixed-point fields correctly", async () => {
    await program.methods
      .updateRiskState(validParams)
      .accounts({
        riskState: riskStatePda,
        authority: provider.wallet.publicKey,
      })
      .rpc();

    const state = await (program.account as any).riskState.fetch(riskStatePda);

    assert.equal(state.thetaScaled.toNumber(), Math.round(0.045 * SCALE));
    assert.equal(state.sigmaScaled.toNumber(), Math.round(0.012 * SCALE));
    assert.equal(state.suggestedLtvBps, 7500);
    assert.equal(state.regimeFlag, 0);
    // z_score is negative
    assert.equal(state.zScoreScaled.toNumber(), Math.round(-0.82 * SCALE));
    // timestamp must be > 0 after first update
    assert.isAbove(state.timestamp.toNumber(), 0);
  });

  it("rejects an update from an unauthorized signer", async () => {
    const rogue = Keypair.generate();

    // Airdrop enough lamports so the rogue account can sign
    const sig = await provider.connection.requestAirdrop(
      rogue.publicKey,
      anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    try {
      await program.methods
        .updateRiskState(validParams)
        .accounts({
          riskState: riskStatePda,
          authority: rogue.publicKey,
        })
        .signers([rogue])
        .rpc();

      assert.fail("Expected Unauthorized error but the transaction succeeded");
    } catch (err: any) {
      assert.include(
        err.message,
        "Unauthorized",
        `Expected Unauthorized, got: ${err.message}`,
      );
    }
  });

  it("rejects params with sigma_scaled = 0 (invalid)", async () => {
    try {
      await program.methods
        .updateRiskState({
          ...validParams,
          sigmaScaled: new anchor.BN(0),
        })
        .accounts({
          riskState: riskStatePda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      assert.fail("Expected InvalidRiskParams but the transaction succeeded");
    } catch (err: any) {
      assert.include(
        err.message,
        "InvalidRiskParams",
        `Expected InvalidRiskParams, got: ${err.message}`,
      );
    }
  });

  it("rejects params with negative theta_scaled (invalid)", async () => {
    try {
      await program.methods
        .updateRiskState({
          ...validParams,
          thetaScaled: new anchor.BN(-1),
        })
        .accounts({
          riskState: riskStatePda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      assert.fail("Expected InvalidRiskParams but the transaction succeeded");
    } catch (err: any) {
      assert.include(
        err.message,
        "InvalidRiskParams",
        `Expected InvalidRiskParams, got: ${err.message}`,
      );
    }
  });

  it("rejects suggested_ltv_bps > 10_000 (invalid)", async () => {
    try {
      await program.methods
        .updateRiskState({
          ...validParams,
          suggestedLtvBps: 10_001,
        })
        .accounts({
          riskState: riskStatePda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      assert.fail("Expected InvalidRiskParams but the transaction succeeded");
    } catch (err: any) {
      assert.include(
        err.message,
        "InvalidRiskParams",
        `Expected InvalidRiskParams, got: ${err.message}`,
      );
    }
  });

  it("rejects a second update submitted immediately (rate-limit)", async () => {
    // The previous valid update already set timestamp > 0.
    // Submitting again in the same block must hit UpdateTooFrequent.
    try {
      await program.methods
        .updateRiskState(validParams)
        .accounts({
          riskState: riskStatePda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      assert.fail("Expected UpdateTooFrequent but the transaction succeeded");
    } catch (err: any) {
      assert.include(
        err.message,
        "UpdateTooFrequent",
        `Expected UpdateTooFrequent, got: ${err.message}`,
      );
    }
  });
});
