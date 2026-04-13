import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

describe("risk-oracle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program: any = anchor.workspace.RiskOracle;

  it("initializes a risk state PDA", async () => {
    const lstId = "mSOL";
    const [riskState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("risk"), Buffer.from(lstId)],
      program.programId,
    );

    await program.methods
      .initializeOracle(lstId, provider.wallet.publicKey)
      .accounts({
        riskState,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const state = await (program.account as any).riskState.fetch(riskState);
    assert.equal(state.lstId, lstId);
  });
});
