import { useMemo, useState } from 'react';
import '@solana/wallet-adapter-react-ui/styles.css';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { ArrowUpRight } from 'lucide-react';
import type { OracleSnapshot } from '../types';
import { cn } from '../types';
import { SolanaWalletProvider } from './SolanaWalletProvider';
import {
  buildUpdateRiskStateInstruction,
  isUnauthorizedOracleRejection,
} from '../lib/updateRiskInstruction';

const DEVNET_EXPLORER_BASE = 'https://explorer.solana.com';

type WalletDemoTone = 'neutral' | 'expected' | 'danger';

type WalletDemoState = {
  phase: 'idle' | 'simulating' | 'previewed' | 'sending' | 'sent';
  headline: string;
  detail: string;
  logs: string[];
  tone: WalletDemoTone;
  signature?: string | null;
  expectedUnauthorized: boolean;
};

function explorerHref(kind: 'tx', value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return `${DEVNET_EXPLORER_BASE}/${kind}/${value}?cluster=devnet`;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function extractErrorLogs(error: unknown): string[] {
  if (error && typeof error === 'object' && 'logs' in error) {
    const { logs } = error as { logs?: unknown };
    if (Array.isArray(logs)) {
      return logs.filter((value): value is string => typeof value === 'string');
    }
  }
  return [];
}

function DevnetWriteGuardDemoContent({
  oracleSnapshot,
}: {
  oracleSnapshot: OracleSnapshot | null;
}) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [walletDemo, setWalletDemo] = useState<WalletDemoState>({
    phase: 'idle',
    headline: 'Preview a live devnet call before asking your wallet to sign.',
    detail:
      'The simulation step uses the current oracle payload and your connected wallet address as the signer. Non-authority wallets should be rejected with Unauthorized.',
    logs: [],
    tone: 'neutral',
    signature: null,
    expectedUnauthorized: false,
  });

  const walletDemoPreview = useMemo(() => {
    if (!oracleSnapshot?.program_id || !oracleSnapshot?.risk_state_pda) {
      return null;
    }
    return {
      cluster: 'devnet',
      programId: oracleSnapshot.program_id,
      riskStatePda: oracleSnapshot.risk_state_pda,
      lstId: oracleSnapshot.lst_id,
      theta: oracleSnapshot.theta,
      sigma: oracleSnapshot.sigma,
      regimeFlag: oracleSnapshot.regime_flag,
      suggestedLtv: oracleSnapshot.suggested_ltv,
      zScore: oracleSnapshot.z_score,
    };
  }, [oracleSnapshot]);

  const buildWalletDemoTransaction = async (authority: PublicKey) => {
    if (!walletDemoPreview) {
      throw new Error('Oracle snapshot unavailable for wallet demo.');
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const instruction = buildUpdateRiskStateInstruction({
      authority,
      riskStatePda: walletDemoPreview.riskStatePda,
      programId: walletDemoPreview.programId,
      lstId: walletDemoPreview.lstId,
      theta: walletDemoPreview.theta,
      sigma: walletDemoPreview.sigma,
      regimeFlag: walletDemoPreview.regimeFlag,
      suggestedLtv: walletDemoPreview.suggestedLtv,
      zScore: walletDemoPreview.zScore,
    });

    const transaction = new Transaction({
      feePayer: authority,
      blockhash,
      lastValidBlockHeight,
    }).add(instruction);

    return { transaction, blockhash, lastValidBlockHeight };
  };

  const simulateUnauthorizedCall = async () => {
    if (!publicKey) {
      return;
    }

    setWalletDemo({
      phase: 'simulating',
      headline: 'Simulating devnet transaction...',
      detail: 'No wallet signature requested in this step.',
      logs: [],
      tone: 'neutral',
      signature: null,
      expectedUnauthorized: false,
    });

    try {
      const { transaction } = await buildWalletDemoTransaction(publicKey);
      const simulation = await connection.simulateTransaction(
        transaction as never,
        {
          commitment: 'processed',
          sigVerify: false,
        } as never,
      );
      const logs = simulation.value.logs ?? [];
      const detail = simulation.value.err
        ? JSON.stringify(simulation.value.err)
        : 'Simulation returned success.';
      const expectedUnauthorized = isUnauthorizedOracleRejection(detail, logs);

      setWalletDemo({
        phase: 'previewed',
        headline: expectedUnauthorized
          ? 'Simulation shows the program will reject this wallet.'
          : simulation.value.err
            ? 'Simulation failed for an unexpected reason.'
            : 'Simulation unexpectedly succeeded.',
        detail: expectedUnauthorized
          ? 'The on-chain authority gate is active. Non-authority wallets should fail here.'
          : detail,
        logs,
        tone: expectedUnauthorized ? 'expected' : 'danger',
        signature: null,
        expectedUnauthorized,
      });
    } catch (error) {
      setWalletDemo({
        phase: 'previewed',
        headline: 'Simulation failed before the program could run.',
        detail: formatUnknownError(error),
        logs: extractErrorLogs(error),
        tone: 'danger',
        signature: null,
        expectedUnauthorized: false,
      });
    }
  };

  const sendUnauthorizedCall = async () => {
    if (!publicKey) {
      return;
    }

    setWalletDemo((current) => ({
      ...current,
      phase: 'sending',
      headline: 'Requesting wallet signature...',
      detail:
        'The signed transaction should still be rejected by the program unless this wallet is the stored authority.',
      signature: null,
    }));

    try {
      const { transaction, blockhash, lastValidBlockHeight } =
        await buildWalletDemoTransaction(publicKey);
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'processed',
      });
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );

      if (confirmation.value.err) {
        setWalletDemo({
          phase: 'sent',
          headline: 'Transaction reached the cluster but failed.',
          detail: JSON.stringify(confirmation.value.err),
          logs: [],
          tone: 'danger',
          signature,
          expectedUnauthorized: false,
        });
        return;
      }

      setWalletDemo({
        phase: 'sent',
        headline: 'Transaction succeeded unexpectedly.',
        detail:
          'This wallet was able to update the oracle. That should only happen for the configured authority and needs review if unexpected.',
        logs: [],
        tone: 'danger',
        signature,
        expectedUnauthorized: false,
      });
    } catch (error) {
      const detail = formatUnknownError(error);
      const logs = extractErrorLogs(error);
      const expectedUnauthorized = isUnauthorizedOracleRejection(detail, logs);

      setWalletDemo({
        phase: 'sent',
        headline: expectedUnauthorized
          ? 'Program rejected the wallet as expected.'
          : 'Wallet flow failed for an unexpected reason.',
        detail: expectedUnauthorized
          ? 'The signature path confirmed the program enforces its authority check on devnet.'
          : detail,
        logs,
        tone: expectedUnauthorized ? 'expected' : 'danger',
        signature: null,
        expectedUnauthorized,
      });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 2xl:grid-cols-[0.82fr_1.18fr]">
      <div className="space-y-6">
        <div className="border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
            How This Demo Works
          </div>
          <p className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
            Connect a devnet wallet and try calling{' '}
            <span className="text-zinc-300">update_risk_state</span> yourself. The current
            PegShield payload is reused as the transaction body. Unless your wallet is the
            configured oracle authority, the program should reject the write with{' '}
            <span className="text-emergency-red">Unauthorized</span>.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <div className="border border-zinc-800 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">
              Cluster
            </div>
            <div className="font-mono text-[11px] text-zinc-300">devnet</div>
          </div>
          <div className="border border-zinc-800 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">
              Instruction
            </div>
            <div className="font-mono text-[11px] text-zinc-300">update_risk_state</div>
          </div>
          <div className="border border-zinc-800 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">
              Program ID
            </div>
            <div className="break-all font-mono text-[11px] text-zinc-300">
              {walletDemoPreview?.programId ?? 'unavailable'}
            </div>
          </div>
          <div className="border border-zinc-800 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">
              Risk State PDA
            </div>
            <div className="break-all font-mono text-[11px] text-zinc-300">
              {walletDemoPreview?.riskStatePda ?? 'unavailable'}
            </div>
          </div>
          <div className="border border-zinc-800 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">
              Payload LTV
            </div>
            <div className="font-mono text-[11px] text-zinc-300">
              {walletDemoPreview
                ? `${(walletDemoPreview.suggestedLtv * 100).toFixed(1)}%`
                : 'unavailable'}
            </div>
          </div>
          <div className="border border-zinc-800 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">
              Connected Wallet
            </div>
            <div className="break-all font-mono text-[11px] text-zinc-300">
              {publicKey ? publicKey.toBase58() : 'not connected'}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="min-w-0">
            <WalletMultiButton />
          </div>
          <button
            type="button"
            onClick={simulateUnauthorizedCall}
            disabled={
              !connected ||
              !walletDemoPreview ||
              walletDemo.phase === 'simulating' ||
              walletDemo.phase === 'sending'
            }
            className="border border-zinc-800 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {walletDemo.phase === 'simulating' ? 'Simulating...' : 'Preview Unauthorized Call'}
          </button>
          <button
            type="button"
            onClick={sendUnauthorizedCall}
            disabled={
              !connected ||
              !walletDemoPreview ||
              walletDemo.phase === 'simulating' ||
              walletDemo.phase === 'sending'
            }
            className="border border-solana-green/40 bg-solana-green/5 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-solana-green transition-colors hover:border-solana-green hover:bg-solana-green/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {walletDemo.phase === 'sending' ? 'Awaiting Wallet...' : 'Request Wallet Signature'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div
          className={cn(
            'border p-4 transition-colors',
            walletDemo.tone === 'expected'
              ? 'border-solana-green/40 bg-solana-green/5'
              : walletDemo.tone === 'danger'
                ? 'border-emergency-red/40 bg-emergency-red/10'
                : 'border-zinc-800 bg-zinc-950/40',
          )}
        >
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
            Latest Result
          </div>
          <div
            className={cn(
              'text-sm font-bold uppercase tracking-[0.08em]',
              walletDemo.tone === 'expected'
                ? 'text-solana-green'
                : walletDemo.tone === 'danger'
                  ? 'text-emergency-red'
                  : 'text-white',
            )}
          >
            {walletDemo.headline}
          </div>
          <div className="mt-2 text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
            {walletDemo.detail}
          </div>
          {walletDemo.signature && (
            <a
              href={explorerHref('tx', walletDemo.signature)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-solana-green hover:underline"
            >
              View signature on Explorer <ArrowUpRight size={12} />
            </a>
          )}
        </div>

        <div className="border border-zinc-800 bg-zinc-950/50 p-4 text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
          Preview runs <span className="text-zinc-300">simulation only</span> and does not ask the
          wallet to sign. The second button is the explicit approval step. It is expected to fail
          for non-authority wallets.
        </div>

        <div className="border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
            Simulation / Preflight Logs
          </div>
          <div className="max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-400">
            {walletDemo.logs.length > 0 ? (
              walletDemo.logs.map((entry, index) => (
                <div key={`${entry}-${index}`} className="mb-1 break-all">
                  {entry}
                </div>
              ))
            ) : (
              <div className="text-zinc-600">
                Run the preview step to inspect runtime logs before any wallet signature is
                requested.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DevnetWriteGuardDemo({
  oracleSnapshot,
}: {
  oracleSnapshot: OracleSnapshot | null;
}) {
  return (
    <SolanaWalletProvider>
      <DevnetWriteGuardDemoContent oracleSnapshot={oracleSnapshot} />
    </SolanaWalletProvider>
  );
}
