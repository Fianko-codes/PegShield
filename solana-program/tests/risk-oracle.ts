import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
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

  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("attester_registry")],
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

  // ==================== SINGLE-ATTESTER MODE TESTS ====================

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
    assert.equal(state.updateMode, 0); // single-attester mode
    assert.equal(
      state.authority.toBase58(),
      provider.wallet.publicKey.toBase58(),
    );
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
    assert.equal(state.zScoreScaled.toNumber(), Math.round(-0.82 * SCALE));
    assert.isAbove(state.timestamp.toNumber(), 0);
  });

  it("rejects an update from an unauthorized signer", async () => {
    const rogue = Keypair.generate();

    const sig = await provider.connection.requestAirdrop(
      rogue.publicKey,
      LAMPORTS_PER_SOL,
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

  // ==================== MULTI-ATTESTER MODE TESTS ====================

  describe("multi-attester consensus", () => {
    const attester1 = Keypair.generate();
    const attester2 = Keypair.generate();
    const attester3 = Keypair.generate();
    const disputer = Keypair.generate();
    const slashDestination = Keypair.generate();
    const multiLstId = "jitoSOL";
    const round1 = new anchor.BN(1);
    const round2 = new anchor.BN(2);

    const [multiRiskStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("risk"), Buffer.from(multiLstId)],
      program.programId,
    );

    const [pendingUpdateRound1Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pending_update"), Buffer.from(multiLstId), Buffer.from(round1.toArrayLike(Buffer, "le", 8))],
      program.programId,
    );

    const [pendingUpdateRound2Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pending_update"), Buffer.from(multiLstId), Buffer.from(round2.toArrayLike(Buffer, "le", 8))],
      program.programId,
    );

    const [disputeRound2Attester3Pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("dispute_record"),
        Buffer.from(multiLstId),
        Buffer.from(round2.toArrayLike(Buffer, "le", 8)),
        attester3.publicKey.toBuffer(),
      ],
      program.programId,
    );

    const [disputeRound2Attester2Pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("dispute_record"),
        Buffer.from(multiLstId),
        Buffer.from(round2.toArrayLike(Buffer, "le", 8)),
        attester2.publicKey.toBuffer(),
      ],
      program.programId,
    );

    before(async () => {
      // Airdrop to attesters
      for (const attester of [attester1, attester2, attester3, disputer]) {
        const sig = await provider.connection.requestAirdrop(
          attester.publicKey,
          5 * LAMPORTS_PER_SOL,
        );
        await provider.connection.confirmTransaction(sig);
      }
    });

    it("initializes attester registry with threshold 2", async () => {
      await program.methods
        .initializeRegistry(2, new anchor.BN(LAMPORTS_PER_SOL)) // threshold=2, minBond=1 SOL
        .accounts({
          registry: registryPda,
          admin: provider.wallet.publicKey,
          slashDestination: slashDestination.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const registry = await (program.account as any).attesterRegistry.fetch(registryPda);
      assert.equal(registry.threshold, 2);
      assert.equal(registry.attesterCount, 0);
      assert.equal(registry.minBond.toNumber(), LAMPORTS_PER_SOL);
    });

    it("attester 1 registers with 1.5 SOL bond", async () => {
      const bondAmount = new anchor.BN(1.5 * LAMPORTS_PER_SOL);

      await program.methods
        .registerAttester(bondAmount)
        .accounts({
          registry: registryPda,
          attester: attester1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([attester1])
        .rpc();

      const registry = await (program.account as any).attesterRegistry.fetch(registryPda);
      assert.equal(registry.attesterCount, 1);
      assert.equal(registry.totalBonded.toNumber(), bondAmount.toNumber());
    });

    it("attester 2 registers with 1 SOL bond", async () => {
      const bondAmount = new anchor.BN(LAMPORTS_PER_SOL);

      await program.methods
        .registerAttester(bondAmount)
        .accounts({
          registry: registryPda,
          attester: attester2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([attester2])
        .rpc();

      const registry = await (program.account as any).attesterRegistry.fetch(registryPda);
      assert.equal(registry.attesterCount, 2);
    });

    it("attester 3 registers with 1 SOL bond", async () => {
      const bondAmount = new anchor.BN(LAMPORTS_PER_SOL);

      await program.methods
        .registerAttester(bondAmount)
        .accounts({
          registry: registryPda,
          attester: attester3.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([attester3])
        .rpc();

      const registry = await (program.account as any).attesterRegistry.fetch(registryPda);
      assert.equal(registry.attesterCount, 3);
    });

    it("rejects duplicate attester registration", async () => {
      try {
        await program.methods
          .registerAttester(new anchor.BN(LAMPORTS_PER_SOL))
          .accounts({
            registry: registryPda,
            attester: attester1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([attester1])
          .rpc();

        assert.fail("Expected AlreadyRegistered error");
      } catch (err: any) {
        assert.include(err.message, "AlreadyRegistered");
      }
    });

    it("initializes multi-attester oracle for jitoSOL", async () => {
      await program.methods
        .initializeOracle(multiLstId, provider.wallet.publicKey)
        .accounts({
          riskState: multiRiskStatePda,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const state = await (program.account as any).riskState.fetch(multiRiskStatePda);
      assert.equal(state.lstId, multiLstId);
      assert.equal(state.updateMode, 0); // still single-attester until enabled
    });

    it("enables multi-attester mode for jitoSOL oracle", async () => {
      await program.methods
        .enableMultiAttester(multiLstId)
        .accounts({
          riskState: multiRiskStatePda,
          registry: registryPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      const state = await (program.account as any).riskState.fetch(multiRiskStatePda);
      assert.equal(state.updateMode, 1); // multi-attester mode
      assert.equal(state.attesterRegistry.toBase58(), registryPda.toBase58());
    });

    it("rejects single-attester update on multi-attester oracle", async () => {
      try {
        await program.methods
          .updateRiskState({ ...validParams, lstId: multiLstId })
          .accounts({
            riskState: multiRiskStatePda,
            authority: provider.wallet.publicKey,
          })
          .rpc();

        assert.fail("Expected MultiAttesterModeActive error");
      } catch (err: any) {
        assert.include(err.message, "MultiAttesterModeActive");
      }
    });

    it("attester 1 proposes an update", async () => {
      await program.methods
        .proposeUpdate(
          multiLstId,
          round1,
          toScaled(0.05),    // theta
          toScaled(0.015),   // sigma
          0,                  // regime_flag
          toLtvBps(0.72),    // suggested_ltv_bps
          toScaled(-0.5),    // z_score
        )
        .accounts({
          riskState: multiRiskStatePda,
          registry: registryPda,
          pendingUpdate: pendingUpdateRound1Pda,
          proposer: attester1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([attester1])
        .rpc();

      const pending = await (program.account as any).pendingUpdate.fetch(pendingUpdateRound1Pda);
      assert.equal(pending.lstId, multiLstId);
      assert.equal(pending.roundId.toNumber(), round1.toNumber());
      assert.equal(pending.confirmationCount, 1); // proposer auto-confirms
      assert.equal(pending.isFinalized, false);
    });

    it("attester 2 confirms and finalizes the update (threshold reached)", async () => {
      await program.methods
        .confirmUpdate(multiLstId, round1)
        .accounts({
          riskState: multiRiskStatePda,
          registry: registryPda,
          pendingUpdate: pendingUpdateRound1Pda,
          confirmer: attester2.publicKey,
        })
        .signers([attester2])
        .rpc();

      // Check pending update is finalized
      const pending = await (program.account as any).pendingUpdate.fetch(pendingUpdateRound1Pda);
      assert.equal(pending.confirmationCount, 2);
      assert.equal(pending.isFinalized, true);
      assert.isAbove(pending.finalizedAt.toNumber(), 0);
      assert.isAbove(pending.finalizedSlot.toNumber(), 0);

      // Check risk state was updated
      const state = await (program.account as any).riskState.fetch(multiRiskStatePda);
      assert.equal(state.thetaScaled.toNumber(), Math.round(0.05 * SCALE));
      assert.equal(state.sigmaScaled.toNumber(), Math.round(0.015 * SCALE));
      assert.equal(state.suggestedLtvBps, 7200);
      assert.isAbove(state.timestamp.toNumber(), 0);
    });

    it("can process a second update for the same LST after the first one closes", async () => {
      await program.methods
        .proposeUpdate(
          multiLstId,
          round2,
          toScaled(0.08),
          toScaled(0.02),
          1,
          toLtvBps(0.55),
          toScaled(-2.7),
        )
        .accounts({
          riskState: multiRiskStatePda,
          registry: registryPda,
          pendingUpdate: pendingUpdateRound2Pda,
          proposer: attester3.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([attester3])
        .rpc();

      await program.methods
        .confirmUpdate(multiLstId, round2)
        .accounts({
          riskState: multiRiskStatePda,
          registry: registryPda,
          pendingUpdate: pendingUpdateRound2Pda,
          confirmer: attester1.publicKey,
        })
        .signers([attester1])
        .rpc();

      const state = await (program.account as any).riskState.fetch(multiRiskStatePda);
      assert.equal(state.thetaScaled.toNumber(), Math.round(0.08 * SCALE));
      assert.equal(state.sigmaScaled.toNumber(), Math.round(0.02 * SCALE));
      assert.equal(state.regimeFlag, 1);
      assert.equal(state.suggestedLtvBps, 5500);
      assert.equal(state.zScoreScaled.toNumber(), Math.round(-2.7 * SCALE));
    });

    it("rejects disputes against registered attesters that did not sign the round", async () => {
      try {
        await program.methods
          .disputeUpdate(
            multiLstId,
            round2,
            attester2.publicKey,
            Array(32).fill(7),
          )
          .accounts({
            disputer: disputer.publicKey,
            registry: registryPda,
            pendingUpdate: pendingUpdateRound2Pda,
            disputeRecord: disputeRound2Attester2Pda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([disputer])
          .rpc();

        assert.fail("Expected AttesterDidNotParticipate error");
      } catch (err: any) {
        assert.include(err.message, "AttesterDidNotParticipate");
      }
    });

    it("files and resolves a dispute against a signer from a finalized round", async () => {
      const evidenceHash = Array.from({ length: 32 }, (_, index) => index + 1);
      const disputerBalanceBeforeResolve = await provider.connection.getBalance(disputer.publicKey);
      const treasuryBalanceBeforeResolve = await provider.connection.getBalance(slashDestination.publicKey);

      await program.methods
        .disputeUpdate(
          multiLstId,
          round2,
          attester3.publicKey,
          evidenceHash,
        )
        .accounts({
          disputer: disputer.publicKey,
          registry: registryPda,
          pendingUpdate: pendingUpdateRound2Pda,
          disputeRecord: disputeRound2Attester3Pda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([disputer])
        .rpc();

      const dispute = await (program.account as any).disputeRecord.fetch(disputeRound2Attester3Pda);
      assert.equal(dispute.disputedAttester.toBase58(), attester3.publicKey.toBase58());
      assert.equal(dispute.disputedSlot.toNumber(), round2.toNumber());
      assert.equal(dispute.finalizedSlot.toNumber() > 0, true);
      assert.equal(dispute.isResolved, false);

      await program.methods
        .resolveDispute(
          multiLstId,
          round2,
          attester3.publicKey,
          true,
        )
        .accounts({
          admin: provider.wallet.publicKey,
          registry: registryPda,
          disputeRecord: disputeRound2Attester3Pda,
          disputer: disputer.publicKey,
          slashDestination: slashDestination.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const registry = await (program.account as any).attesterRegistry.fetch(registryPda);
      const attester3Entry = registry.attesters.find(
        (entry: any) => entry.pubkey.toBase58() === attester3.publicKey.toBase58(),
      );
      assert.equal(attester3Entry.bond.toNumber(), 500_000_000);
      assert.equal(attester3Entry.disputesLost.toNumber(), 1);
      assert.equal(registry.totalBonded.toNumber(), 3_000_000_000);

      const resolvedDispute = await (program.account as any).disputeRecord.fetch(disputeRound2Attester3Pda);
      assert.equal(resolvedDispute.isResolved, true);
      assert.equal(resolvedDispute.attesterSlashed, true);
      assert.equal(resolvedDispute.slashAmount.toNumber(), 500_000_000);
      assert.equal(resolvedDispute.disputerReward.toNumber(), 250_000_000);

      const disputerBalanceAfterResolve = await provider.connection.getBalance(disputer.publicKey);
      const treasuryBalanceAfterResolve = await provider.connection.getBalance(slashDestination.publicKey);
      assert.equal(disputerBalanceAfterResolve - disputerBalanceBeforeResolve, 250_000_000);
      assert.equal(treasuryBalanceAfterResolve - treasuryBalanceBeforeResolve, 250_000_000);
    });
  });
});
