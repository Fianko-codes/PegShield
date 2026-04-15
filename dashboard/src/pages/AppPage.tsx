import { useEffect, useMemo, useState } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  ChevronDown,
  Cpu,
  FileText,
  Terminal,
  ShieldCheck,
  Zap,
  Lock,
  AlertTriangle,
  Radio,
  TimerReset,
  WalletCards,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { BlockMath } from 'react-katex';
import { cn } from '../types';
import type { LogEntry, MarketSnapshot, OracleSnapshot, RiskState } from '../types';
import { fetchMarketSnapshot } from '../lib/data';
import {
  buildUpdateRiskStateInstruction,
  isUnauthorizedOracleRejection,
} from '../lib/updateRiskInstruction';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const DEVNET_EXPLORER_BASE = 'https://explorer.solana.com';

function formatRelativeMinutes(timestampSeconds: number | undefined, nowMs: number): string {
  if (!timestampSeconds) {
    return 'unavailable';
  }

  const deltaMinutes = Math.max(0, Math.round((nowMs - timestampSeconds * 1000) / 60000));
  if (deltaMinutes === 0) {
    return 'just now';
  }
  if (deltaMinutes === 1) {
    return '1 min ago';
  }
  return `${deltaMinutes} mins ago`;
}

function shortenMiddle(value: string | undefined, lead = 8, tail = 6): string {
  if (!value) {
    return 'unavailable';
  }

  if (value.length <= lead + tail + 3) {
    return value;
  }

  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}

function explorerHref(kind: 'address' | 'tx', value: string | undefined): string | undefined {
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

function TerminalLine({ log }: { log: LogEntry }) {
  const colorClass =
    log.type === 'alert'
      ? 'text-emergency-red'
      : log.type === 'success'
        ? 'text-solana-green'
        : 'text-zinc-400';

  return (
    <div className="mb-2 flex gap-2 font-mono text-[11px] leading-relaxed">
      <span className="shrink-0 text-zinc-600">[{log.timestamp}]</span>
      <span className={cn('min-w-0 break-all', colorClass)}>{log.message}</span>
    </div>
  );
}

function formatSigned(value: number, digits: number): string {
  const formatted = value.toFixed(digits);
  return value > 0 ? `+${formatted}` : formatted;
}

function formatAdfPvalue(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'unavailable';
  }
  if (value < 0.0001) {
    return '<0.0001';
  }
  return value.toFixed(4);
}

function ModelCard({
  theta,
  sigma,
  zScore,
  mu,
  adfPvalue,
  isStationary,
  regime,
}: {
  theta: number;
  sigma: number;
  zScore: number;
  mu?: number;
  adfPvalue?: number;
  isStationary?: boolean;
  regime: number;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const isCritical = regime === 1;
  const regimeLabel = isCritical ? 'CRITICAL' : 'NORMAL';
  const stationarityLabel =
    typeof isStationary === 'boolean'
      ? isStationary
        ? 'ADF rejects non-stationarity'
        : 'ADF indicates non-stationary spread'
      : 'ADF pending';

  return (
    <div
      className={cn(
        'relative h-full overflow-hidden border bg-black/40 backdrop-blur-sm transition-colors duration-500',
        isCritical
          ? 'border-emergency-red/50 shadow-glow-red'
          : 'border-solana-green/50 shadow-glow-green',
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left"
      >
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            <Cpu size={12} /> Model
          </div>
          <div className="text-sm font-bold uppercase tracking-[0.08em] text-white">
            Live OU Process Calibration
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
            {regimeLabel} • {stationarityLabel}
          </div>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 transition-transform duration-300',
            isOpen ? 'rotate-180' : 'rotate-0',
            isCritical ? 'text-emergency-red' : 'text-solana-green',
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="model-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-zinc-800/80 p-4 pt-5">
              <div className="border border-zinc-800/80 bg-zinc-950/70 px-4 py-4 text-center">
                <div className="mono-data text-[11px] uppercase tracking-[0.18em] text-zinc-500 sm:text-sm">
                  Ornstein-Uhlenbeck Process
                </div>
                <div className="mt-3 overflow-x-auto text-white">
                  <BlockMath math={'dX_t = \\theta\\,(\\mu - X_t)\\,dt + \\sigma\\,dW_t'} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 font-mono text-[10px] sm:grid-cols-2">
                <div className="border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <div className="text-zinc-500">Current θ</div>
                  <div className={cn('mt-2 text-lg', isCritical ? 'text-emergency-red' : 'text-solana-green')}>
                    {theta.toFixed(2)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-600">
                    Mean-reversion speed, 1/day
                  </div>
                </div>
                <div className="border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <div className="text-zinc-500">Current σ</div>
                  <div className={cn('mt-2 text-lg', isCritical ? 'text-emergency-red' : 'text-solana-green')}>
                    {sigma.toFixed(4)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-600">
                    Daily volatility
                  </div>
                </div>
                <div className="border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <div className="text-zinc-500">Current z</div>
                  <div className={cn('mt-2 text-lg', isCritical ? 'text-emergency-red' : 'text-solana-green')}>
                    {formatSigned(zScore, 3)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-600">
                    σ from rolling mean
                  </div>
                </div>
                <div className="border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <div className="text-zinc-500">ADF p-val</div>
                  <div className={cn('mt-2 text-lg', isCritical ? 'text-emergency-red' : 'text-solana-green')}>
                    {formatAdfPvalue(adfPvalue)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-600">
                    {typeof isStationary === 'boolean'
                      ? isStationary
                        ? 'Stationary mean-reversion holds'
                        : 'Stationarity rejected'
                      : 'Stationarity unavailable'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border border-zinc-800/80 bg-black/30 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.08em]">
                <span className="text-zinc-500">
                  Regime: <span className={isCritical ? 'text-emergency-red' : 'text-solana-green'}>{regimeLabel}</span>
                </span>
                <span className="text-zinc-500">
                  μ: <span className="text-zinc-300">{typeof mu === 'number' ? formatSigned(mu, 4) : 'unavailable'}</span>
                </span>
                <span className="text-zinc-500">
                  Trigger: <span className="text-zinc-300">|z| ≥ 2.5 and ADF p ≥ 0.05</span>
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AppPage({
  globalState,
  oracleSnapshot,
}: {
  globalState: RiskState;
  oracleSnapshot: OracleSnapshot | null;
}) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [liveTail, setLiveTail] = useState<
    { time: string; spread: number; publishTime: number }[]
  >([]);
  const [heartbeat, setHeartbeat] = useState(false);
  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshot | null>(null);
  const [latestTxSignature, setLatestTxSignature] = useState<string | null>(null);
  const [collateralInput, setCollateralInput] = useState('1000');
  const [clockMs, setClockMs] = useState(() => new Date().getTime());
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
  const accentColor = globalState.regime_flag === 1 ? '#FF4B4B' : '#14F195';

  const baseChartData = useMemo(
    () =>
      oracleSnapshot
        ? oracleSnapshot.history.map((point) => ({
            time: new Date(point.timestamp * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            spread: point.spread_pct,
            publishTime: point.timestamp,
          }))
        : [],
    [oracleSnapshot],
  );

  const logs = useMemo<LogEntry[]>(() => {
    if (!oracleSnapshot) {
      return [];
    }

    const timestamp = new Date(oracleSnapshot.timestamp * 1000).toLocaleTimeString([], {
      hour12: false,
    });

    return [
      {
        id: 'bridge',
        timestamp,
        message: `Snapshot synced from ${oracleSnapshot.source} (${oracleSnapshot.history_source})`,
        type: 'success',
      },
      {
        id: 'risk',
        timestamp,
        message: `Oracle status ${oracleSnapshot.status}; target LTV ${(oracleSnapshot.suggested_ltv * 100).toFixed(1)}%`,
        type: oracleSnapshot.regime_flag === 1 ? 'alert' : 'info',
      },
      {
        id: 'state',
        timestamp,
        message: `PDA ${shortenMiddle(oracleSnapshot.risk_state_pda)} on ${oracleSnapshot.network ?? 'devnet'}`,
        type: 'info',
      },
      {
        id: 'window',
        timestamp,
        message: `Model window ${oracleSnapshot.history_points ?? oracleSnapshot.history.length} samples at ${oracleSnapshot.step_seconds ?? 0}s cadence`,
        type: 'info',
      },
    ];
  }, [oracleSnapshot]);

  const chartData = useMemo(() => {
    const baseTail = baseChartData.slice(-16).map(({ time, spread }) => ({ time, spread }));
    const liveSeries = liveTail.map(({ time, spread }) => ({ time, spread }));
    return [...baseTail, ...liveSeries].slice(-24);
  }, [baseChartData, liveTail]);

  const collateralValueUsd = useMemo(() => {
    const parsed = Number(collateralInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [collateralInput]);

  const fixedBorrowLimitUsd = collateralValueUsd * 0.8;
  const oracleBorrowLimitUsd = collateralValueUsd * globalState.suggested_ltv;
  const oracleDeltaUsd = fixedBorrowLimitUsd - oracleBorrowLimitUsd;
  const oracleFreshness = formatRelativeMinutes(oracleSnapshot?.timestamp, clockMs);
  const marketFreshness = formatRelativeMinutes(marketSnapshot?.publish_time, clockMs);
  const lastUpdateAgeSec =
    oracleSnapshot?.timestamp != null
      ? Math.max(0, Math.floor(clockMs / 1000) - oracleSnapshot.timestamp)
      : null;
  const oracleStatusTone =
    globalState.regime_flag === 1 ? 'text-emergency-red' : 'text-solana-green';
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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHeartbeat((current) => !current);
    }, 1400);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadMarket = async () => {
      const snapshot = await fetchMarketSnapshot();
      if (!snapshot || cancelled) {
        return;
      }

      setMarketSnapshot(snapshot);
      setLiveTail((current) => {
        const nextPoint = {
          time: new Date(snapshot.publish_time * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          spread: snapshot.spread_pct,
          publishTime: snapshot.publish_time,
        };

        if (current.length === 0) {
          if (
            oracleSnapshot &&
            snapshot.publish_time <= oracleSnapshot.timestamp
          ) {
            return current;
          }
          return [nextPoint];
        }

        const lastPoint = current[current.length - 1];
        if (
          snapshot.publish_time <= lastPoint.publishTime ||
          (lastPoint.time === nextPoint.time && lastPoint.spread === nextPoint.spread)
        ) {
          return current;
        }

        return [...current.slice(-7), nextPoint];
      });
    };

    const syncOnResume = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      setClockMs(Date.now());
      void loadMarket();
    };

    void loadMarket();
    const interval = window.setInterval(() => {
      void loadMarket();
    }, 30000);

    window.addEventListener('focus', syncOnResume);
    window.addEventListener('pageshow', syncOnResume);
    document.addEventListener('visibilitychange', syncOnResume);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', syncOnResume);
      window.removeEventListener('pageshow', syncOnResume);
      document.removeEventListener('visibilitychange', syncOnResume);
    };
  }, [oracleSnapshot]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockMs(Date.now());
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLatestSignature = async () => {
      const riskStatePda = oracleSnapshot?.risk_state_pda;
      if (!riskStatePda) {
        setLatestTxSignature(null);
        return;
      }

      try {
        const signatures = await connection.getSignaturesForAddress(new PublicKey(riskStatePda), {
          limit: 1,
        });
        if (!cancelled) {
          setLatestTxSignature(signatures[0]?.signature ?? null);
        }
      } catch {
        if (!cancelled) {
          setLatestTxSignature(null);
        }
      }
    };

    void loadLatestSignature();

    return () => {
      cancelled = true;
    };
  }, [connection, oracleSnapshot?.risk_state_pda]);

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
      // web3.js supports this config at runtime for legacy transactions even
      // though the published TS overloads still prefer the older signature.
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
        tone: expectedUnauthorized ? 'expected' : simulation.value.err ? 'danger' : 'danger',
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
      detail: 'The signed transaction should still be rejected by the program unless this wallet is the stored authority.',
      signature: null,
    }));

    try {
      const { transaction, blockhash, lastValidBlockHeight } = await buildWalletDemoTransaction(publicKey);
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'processed',
      });
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );

      if (confirmation.value.err) {
        const detail = JSON.stringify(confirmation.value.err);
        setWalletDemo({
          phase: 'sent',
          headline: 'Transaction reached the cluster but failed.',
          detail,
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
    <div className="py-4 md:py-6">
      <div className="mb-8 flex flex-col gap-4 border-b border-zinc-800 pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center border transition-all duration-500',
              globalState.regime_flag === 1
                ? 'border-emergency-red shadow-glow-red'
                : 'border-solana-green shadow-glow-green',
            )}
          >
            <ShieldCheck
              className={
                globalState.regime_flag === 1
                  ? 'text-emergency-red'
                  : 'text-solana-green'
              }
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold uppercase tracking-tight sm:text-xl">
              System App <span className="font-normal text-zinc-500">mSOL Risk Feed</span>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {lastUpdateAgeSec !== null && lastUpdateAgeSec > 1800 && (
                <span className="border border-emergency-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-emergency-red">
                  Unsafe to consume • {lastUpdateAgeSec}s since last update
                </span>
              )}
              {lastUpdateAgeSec !== null && lastUpdateAgeSec > 600 && lastUpdateAgeSec <= 1800 && (
                <span className="border border-yellow-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-yellow-500">
                  Stale • {lastUpdateAgeSec}s since last update
                </span>
              )}
            </div>
            <div className="mt-1 flex min-w-0 items-start gap-2 text-[10px] leading-relaxed text-zinc-500">
              <span
                className={cn(
                  'mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full',
                  globalState.regime_flag === 1 ? 'bg-emergency-red' : 'bg-solana-green',
                )}
              />
              <span
                className="min-w-0 break-all"
                title={oracleSnapshot?.risk_state_pda ?? 'snapshot unavailable'}
              >
                Canonical State PDA:{' '}
                <a
                  href={explorerHref('address', oracleSnapshot?.risk_state_pda)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-solana-green"
                >
                  {shortenMiddle(oracleSnapshot?.risk_state_pda, 10, 8)}
                  <ArrowUpRight size={10} className="shrink-0" />
                </a>
              </span>
            </div>
          </div>
        </div>
        <div className="text-left md:text-right">
          <div className="text-[10px] uppercase text-zinc-500">Risk Regime</div>
          <div
            className={cn(
              'text-xs font-bold uppercase',
              globalState.regime_flag === 1 ? 'text-emergency-red' : 'text-solana-green',
            )}
          >
            {globalState.regime_flag === 1 ? 'CRITICAL UNSTABLE' : 'STABLE / MONITORED'}
          </div>
        </div>
      </div>

      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-6 xl:grid-cols-12"
      >
        <motion.section variants={itemVariants} className="space-y-6 xl:col-span-3">
          <div className="space-y-4">
            <div className="relative overflow-hidden border border-zinc-800 p-4">
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                <Activity size={12} /> mSOL/SOL Premium
              </div>
              <div
                className={cn(
                  'mono-data text-3xl font-bold transition-colors duration-500 break-all',
                  globalState.regime_flag === 1 ? 'text-emergency-red' : 'text-white',
                )}
              >
                {((marketSnapshot?.spread_pct ?? globalState.spread) * 100).toFixed(3)}%
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                Market tick {marketFreshness}
              </div>
            </div>

            <div className="border border-zinc-800 p-4">
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                <Zap size={12} /> Volatility (Sigma)
              </div>
              <div className="mono-data text-3xl font-bold break-all">
                {(globalState.sigma * 100).toFixed(4)}%
              </div>
              <div className="mt-3 h-1 w-full bg-zinc-900">
                <motion.div
                  className={cn(
                    'h-full',
                    globalState.regime_flag === 1 ? 'bg-emergency-red' : 'bg-solana-green',
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(globalState.sigma * 5000, 100)}%` }}
                />
              </div>
            </div>

            <div className="border border-zinc-800 p-4">
              <div className="mb-3 text-[10px] uppercase tracking-[0.08em] text-zinc-500">Snapshot Metadata</div>
              <div className="space-y-2 text-[10px] leading-relaxed tracking-[0.04em] text-zinc-400">
                <div className="break-words">Oracle Source: {oracleSnapshot?.source ?? 'unavailable'}</div>
                <div className="break-words">Market Source: {marketSnapshot?.source ?? 'unavailable'}</div>
                <div className="break-words">Updated: {oracleSnapshot?.updated_at_iso ?? 'unavailable'}</div>
                <div className="break-words">
                  Market Tick: {marketSnapshot ? new Date(marketSnapshot.publish_time * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }) : 'unavailable'}
                </div>
                <div>History: {oracleSnapshot?.history_points ?? 0} points</div>
                <div>Oracle Freshness: {oracleFreshness}</div>
                <div className="break-all font-mono lowercase tracking-normal text-zinc-500">
                  Authority:{' '}
                  <a
                    href={explorerHref('address', oracleSnapshot?.authority)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-solana-green"
                    title={oracleSnapshot?.authority ?? 'unavailable'}
                  >
                    {shortenMiddle(oracleSnapshot?.authority, 10, 8)}
                    <ArrowUpRight size={10} className="shrink-0" />
                  </a>
                </div>
                <div className="break-all font-mono lowercase tracking-normal text-zinc-500">
                  Last Updater:{' '}
                  <a
                    href={explorerHref('address', oracleSnapshot?.last_updater)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-solana-green"
                    title={oracleSnapshot?.last_updater ?? 'unavailable'}
                  >
                    {shortenMiddle(oracleSnapshot?.last_updater, 10, 8)}
                    <ArrowUpRight size={10} className="shrink-0" />
                  </a>
                </div>
                <div className="break-all font-mono lowercase tracking-normal text-zinc-500">
                  Latest Tx:{' '}
                  <a
                    href={explorerHref('tx', latestTxSignature ?? undefined)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-solana-green"
                    title={latestTxSignature ?? 'unavailable'}
                  >
                    {shortenMiddle(latestTxSignature ?? undefined, 10, 8)}
                    <ArrowUpRight size={10} className="shrink-0" />
                  </a>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 border border-zinc-800 bg-zinc-900/30 p-4">
              <FileText className="shrink-0 text-zinc-500" />
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase">Dashboard Mode</div>
                <div className="text-[10px] uppercase leading-relaxed tracking-[0.1em] text-zinc-500">
                  Live PDA + live market + snapshot fallback
                </div>
              </div>
            </div>

            <div className="border border-zinc-800 p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                <TimerReset size={12} /> Update Health
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">Oracle compute</span>
                  <span className={cn('text-[10px] font-bold uppercase tracking-[0.1em]', oracleStatusTone)}>
                    {oracleFreshness}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">Market feed</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-300">
                    {marketFreshness}
                  </span>
                </div>
                <div className="h-1 w-full bg-zinc-900">
                  <div
                    className={cn(
                      'h-full transition-all duration-500',
                      globalState.regime_flag === 1 ? 'bg-emergency-red' : 'bg-solana-green',
                    )}
                    style={{ width: oracleFreshness === 'just now' ? '100%' : oracleFreshness === '1 min ago' ? '75%' : '45%' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="space-y-6 xl:col-span-6">
          <div className="space-y-6">
            <div className="relative border border-zinc-800 bg-black p-4 sm:p-6">
              <div className="absolute left-4 right-4 top-4 z-10 sm:left-6 sm:right-auto">
                <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                  Live Market Premium
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-600">
                  <Radio
                    size={10}
                    className={cn(
                      'transition-colors duration-300',
                      heartbeat
                        ? globalState.regime_flag === 1
                          ? 'text-emergency-red'
                          : 'text-solana-green'
                        : 'text-zinc-700',
                    )}
                  />
                  Hermes pulse + live append
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-zinc-700">
                  Snapshot base + live tail overlay
                </div>
              </div>
              <div className="mt-16 h-[260px] w-full sm:mt-8 sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorSpread" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                    <XAxis
                      dataKey="time"
                      stroke="#444"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={30}
                    />
                    <YAxis
                      stroke="#444"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      domain={['dataMin - 0.001', 'dataMax + 0.001']}
                      tickFormatter={(val: number) => `${(val * 100).toFixed(2)}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0D0D0D',
                        border: '1px solid #333',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                      itemStyle={{ color: accentColor }}
                      formatter={(value) => `${(Number(value ?? 0) * 100).toFixed(2)}%`}
                    />
                    <ReferenceLine
                      y={oracleSnapshot?.history?.[0]?.spread_pct ?? 0}
                      stroke="#333"
                      strokeDasharray="5 5"
                    />
                    <Area
                      type="monotone"
                      dataKey="spread"
                      stroke={accentColor}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorSpread)"
                      animationDuration={1000}
                      activeDot={{
                        r: 6,
                        stroke: accentColor,
                        strokeWidth: 2,
                        fill: '#0D0D0D',
                      }}
                      dot={(props) => {
                        const pointIndex = typeof props.index === 'number' ? props.index : -1;
                        if (pointIndex !== chartData.length - 1) {
                          return false;
                        }

                        return (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={heartbeat ? 5 : 3}
                            stroke={accentColor}
                            strokeWidth={2}
                            fill="#0D0D0D"
                          />
                        );
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
              <ModelCard
                theta={globalState.theta}
                sigma={globalState.sigma}
                zScore={globalState.z_score}
                mu={oracleSnapshot?.mu}
                adfPvalue={oracleSnapshot?.adf_pvalue}
                isStationary={oracleSnapshot?.is_stationary}
                regime={globalState.regime_flag}
              />

              <div
                className={cn(
                  'flex flex-col justify-between border p-4 transition-all duration-500',
                  globalState.regime_flag === 1
                    ? 'border-emergency-red bg-emergency-red/10 shadow-brutal-red'
                    : 'border-solana-green bg-solana-green/10 shadow-brutal-green',
                )}
              >
                <div>
                  <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                    <Lock size={12} /> Suggested LTV
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="mono-data text-4xl font-bold tracking-tighter sm:text-5xl break-all">
                      {(globalState.suggested_ltv * 100).toFixed(1)}%
                    </span>
                    <span className="font-mono text-xs uppercase text-zinc-500">
                      Oracle Target
                    </span>
                  </div>
                </div>
                <div className="mt-4 space-y-1">
                  <div className="relative flex h-4 w-full overflow-hidden bg-black/40">
                    <div className="h-full bg-zinc-800" style={{ width: '60%' }} />
                    <motion.div
                      className={cn(
                        'absolute top-0 z-10 h-full w-1',
                        globalState.regime_flag === 1
                          ? 'bg-white shadow-glow-red'
                          : 'bg-black',
                      )}
                      animate={{ left: `${globalState.suggested_ltv * 100}%` }}
                    />
                    <div
                      className={cn(
                        'h-full opacity-50',
                        globalState.regime_flag === 1 ? 'bg-emergency-red' : 'bg-solana-green',
                      )}
                      style={{ width: `${globalState.suggested_ltv * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="border border-zinc-800 bg-black p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                  <WalletCards size={12} /> Protocol Borrow Calculator
                </div>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-[10px] uppercase tracking-[0.1em] text-zinc-600">
                        Collateral Value USD
                      </span>
                      <input
                        value={collateralInput}
                        onChange={(event) => setCollateralInput(event.target.value)}
                        inputMode="decimal"
                        className="w-full border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm text-white outline-none transition-colors focus:border-solana-green"
                        placeholder="1000"
                      />
                    </label>
                    <div className="text-[10px] uppercase leading-relaxed tracking-[0.1em] text-zinc-500">
                      This shows how a lending protocol could translate PegShield’s current oracle target into a
                      max borrow decision for LST collateral.
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 border border-zinc-800 p-3">
                      <span className="pr-4 text-[10px] uppercase tracking-[0.1em] text-zinc-500">Fixed 80% policy</span>
                      <span className="shrink-0 font-mono text-sm text-zinc-300">${fixedBorrowLimitUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border border-solana-green/30 bg-solana-green/5 p-3">
                      <span className="pr-4 text-[10px] uppercase tracking-[0.1em] text-solana-green">PegShield policy</span>
                      <span className="shrink-0 font-mono text-sm text-solana-green">${oracleBorrowLimitUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border border-zinc-800 p-3">
                      <span className="pr-4 text-[10px] uppercase tracking-[0.1em] text-zinc-500">Risk delta</span>
                      <span className="shrink-0 font-mono text-sm text-white">${oracleDeltaUsd.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-zinc-800 bg-black p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                  <Database size={12} /> Integration Surface
                </div>
                <div className="space-y-3">
                  <div className="border border-zinc-800 p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Program ID</div>
                    <a
                      href={explorerHref('address', oracleSnapshot?.program_id)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex break-all font-mono text-[11px] text-zinc-300 transition-colors hover:text-solana-green"
                    >
                      {oracleSnapshot?.program_id ?? 'unavailable'}
                    </a>
                  </div>
                  <div className="border border-zinc-800 p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Risk State PDA</div>
                    <a
                      href={explorerHref('address', oracleSnapshot?.risk_state_pda)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex break-all font-mono text-[11px] text-zinc-300 transition-colors hover:text-solana-green"
                    >
                      {oracleSnapshot?.risk_state_pda ?? 'unavailable'}
                    </a>
                  </div>
                  <div className="border border-zinc-800 p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Last Updater</div>
                    <a
                      href={explorerHref('address', oracleSnapshot?.last_updater)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex break-all font-mono text-[11px] text-zinc-300 transition-colors hover:text-solana-green"
                    >
                      {oracleSnapshot?.last_updater ?? 'unavailable'}
                    </a>
                  </div>
                  <div className="border border-zinc-800 p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Latest Tx Signature</div>
                    <a
                      href={explorerHref('tx', latestTxSignature ?? undefined)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex break-all font-mono text-[11px] text-zinc-300 transition-colors hover:text-solana-green"
                    >
                      {latestTxSignature ?? 'unavailable'}
                    </a>
                  </div>
                  <a
                    href="https://pegshield.anubhavprasai.com.np/api/oracle-state"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 border border-zinc-800 p-3 transition-colors hover:border-solana-green"
                  >
                    <span className="min-w-0 text-[10px] uppercase tracking-[0.1em] text-zinc-400">Open live oracle payload</span>
                    <ArrowUpRight size={14} className="shrink-0 text-solana-green" />
                  </a>
                </div>
              </div>
            </div>

          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="xl:col-span-3">
          <div className="flex h-full flex-col border border-zinc-800 bg-black">
            <div className="border-b border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                <Terminal size={12} /> Logic Terminal
              </div>
            </div>
            <div className="max-h-[520px] flex-1 overflow-y-auto p-4 sm:max-h-[600px]">
              <AnimatePresence initial={false}>
                {logs.map((log) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: 5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <TerminalLine log={log} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="flex justify-between border-t border-zinc-800 p-3 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-600">
              <span className="flex items-center gap-1">
                <AlertTriangle
                  size={10}
                  className={
                    globalState.regime_flag === 1 ? 'text-emergency-red' : 'text-zinc-700'
                  }
                />
                Snapshot Active
              </span>
            </div>
          </div>
        </motion.section>
      </motion.main>

      <motion.section
        variants={itemVariants}
        initial="hidden"
        animate="show"
        className="mt-8 border border-zinc-800 bg-black p-5 sm:mt-10 sm:p-6 lg:p-8"
      >
        <div className="mb-8 flex flex-col gap-3 border-b border-zinc-900 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              <WalletCards size={12} /> Devnet Write Guard Demo
            </div>
            <h2 className="text-2xl font-bold uppercase tracking-tight md:text-3xl">
              Try Calling <span className="text-solana-green">update_risk_state</span> Yourself
            </h2>
            <p className="max-w-3xl text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500 md:text-[11px]">
              This section is intentionally separated from the live dashboard metrics. It demonstrates that the on-chain
              program is real, writable on devnet, and still rejects any wallet that is not the configured authority.
            </p>
          </div>
          <div className="border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
            Preview first. Sign second. Unauthorized rejection is the expected success condition.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[0.82fr_1.18fr]">
          <div className="space-y-4">
            <div className="border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">How This Demo Works</div>
              <p className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
                Connect a devnet wallet and try calling <span className="text-zinc-300">update_risk_state</span> yourself.
                The current PegShield payload is reused as the transaction body. Unless your wallet is the configured
                oracle authority, the program should reject the write with <span className="text-emergency-red">Unauthorized</span>.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div className="border border-zinc-800 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Cluster</div>
                <div className="font-mono text-[11px] text-zinc-300">devnet</div>
              </div>
              <div className="border border-zinc-800 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Instruction</div>
                <div className="font-mono text-[11px] text-zinc-300">update_risk_state</div>
              </div>
              <div className="border border-zinc-800 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Program ID</div>
                <div className="break-all font-mono text-[11px] text-zinc-300">
                  {walletDemoPreview?.programId ?? 'unavailable'}
                </div>
              </div>
              <div className="border border-zinc-800 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Risk State PDA</div>
                <div className="break-all font-mono text-[11px] text-zinc-300">
                  {walletDemoPreview?.riskStatePda ?? 'unavailable'}
                </div>
              </div>
              <div className="border border-zinc-800 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Payload LTV</div>
                <div className="font-mono text-[11px] text-zinc-300">
                  {walletDemoPreview ? `${(walletDemoPreview.suggestedLtv * 100).toFixed(1)}%` : 'unavailable'}
                </div>
              </div>
              <div className="border border-zinc-800 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Connected Wallet</div>
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
                disabled={!connected || !walletDemoPreview || walletDemo.phase === 'simulating' || walletDemo.phase === 'sending'}
                className="border border-zinc-800 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {walletDemo.phase === 'simulating' ? 'Simulating...' : 'Preview Unauthorized Call'}
              </button>
              <button
                type="button"
                onClick={sendUnauthorizedCall}
                disabled={!connected || !walletDemoPreview || walletDemo.phase === 'simulating' || walletDemo.phase === 'sending'}
                className="border border-solana-green/40 bg-solana-green/5 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-solana-green transition-colors hover:border-solana-green hover:bg-solana-green/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {walletDemo.phase === 'sending' ? 'Awaiting Wallet...' : 'Request Wallet Signature'}
              </button>
            </div>
          </div>

          <div className="space-y-4">
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
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">Latest Result</div>
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
              Preview runs <span className="text-zinc-300">simulation only</span> and does not ask the wallet to sign.
              The second button is the explicit approval step. It is expected to fail for non-authority wallets.
            </div>

            <div className="border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">Simulation / Preflight Logs</div>
              <div className="max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-400">
                {walletDemo.logs.length > 0 ? (
                  walletDemo.logs.map((entry, index) => (
                    <div key={`${entry}-${index}`} className="mb-1 break-all">
                      {entry}
                    </div>
                  ))
                ) : (
                  <div className="text-zinc-600">
                    Run the preview step to inspect runtime logs before any wallet signature is requested.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
