import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  TimerReset,
  WalletCards,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { BlockMath } from 'react-katex';
import { cn } from '../types';
import type { LogEntry, MarketSnapshot, OracleSnapshot, RiskState } from '../types';
import { fetchMarketSnapshot } from '../lib/data';
import { SUPPORTED_LSTS, type SupportedLstId } from '../lib/assets';

const AppMarketChart = lazy(() => import('../components/AppMarketChart'));
const DevnetWriteGuardDemo = lazy(() => import('../components/DevnetWriteGuardDemo'));

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
const DEVNET_RPC_URL = 'https://api.devnet.solana.com';

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

function assetSymbolFromLstId(lstId: string | undefined): string {
  if (!lstId) {
    return 'LST';
  }
  return lstId.replace(/-v\d+$/i, '');
}

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

              <div className="grid grid-cols-2 gap-3 font-mono text-[10px] lg:grid-cols-4">
                <div className="min-w-0 border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <div className="text-zinc-500">Current θ</div>
                  <div className={cn('mt-2 text-lg break-all', isCritical ? 'text-emergency-red' : 'text-solana-green')}>
                    {theta.toFixed(2)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-600 break-words">
                    Mean-reversion speed, 1/day
                  </div>
                </div>
                <div className="min-w-0 border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <div className="text-zinc-500">Current σ</div>
                  <div className={cn('mt-2 text-lg break-all', isCritical ? 'text-emergency-red' : 'text-solana-green')}>
                    {sigma.toFixed(4)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-600 break-words">
                    Daily volatility
                  </div>
                </div>
                <div className="min-w-0 border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <div className="text-zinc-500">Current z</div>
                  <div className={cn('mt-2 text-lg break-all', isCritical ? 'text-emergency-red' : 'text-solana-green')}>
                    {formatSigned(zScore, 3)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-600 break-words">
                    σ from rolling mean
                  </div>
                </div>
                <div className="min-w-0 border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <div className="text-zinc-500">ADF p-val</div>
                  <div className={cn('mt-2 text-lg break-all', isCritical ? 'text-emergency-red' : 'text-solana-green')}>
                    {formatAdfPvalue(adfPvalue)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-600 break-words">
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

function AppPageContent({
  globalState,
  oracleSnapshot,
  selectedLstId,
  onSelectLstId,
}: {
  globalState: RiskState;
  oracleSnapshot: OracleSnapshot | null;
  selectedLstId: SupportedLstId;
  onSelectLstId: (lstId: SupportedLstId) => void;
}) {
  const [liveTail, setLiveTail] = useState<
    { time: string; spread: number; publishTime: number }[]
  >([]);
  const [heartbeat, setHeartbeat] = useState(false);
  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshot | null>(null);
  const [latestTxSignature, setLatestTxSignature] = useState<string | null>(null);
  const [collateralInput, setCollateralInput] = useState('1000');
  const [clockMs, setClockMs] = useState(() => new Date().getTime());
  const accentColor = globalState.regime_flag === 1 ? '#FF4B4B' : '#14F195';
  const assetSymbol = oracleSnapshot?.asset_symbol ?? assetSymbolFromLstId(globalState.lst_id);
  const baseSymbol = oracleSnapshot?.base_symbol ?? 'SOL';

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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHeartbeat((current) => !current);
    }, 1400);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadMarket = async () => {
      const snapshot = await fetchMarketSnapshot(selectedLstId);
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
  }, [oracleSnapshot, selectedLstId]);

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
        const response = await fetch(DEVNET_RPC_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'risk-oracle-latest-tx',
            method: 'getSignaturesForAddress',
            params: [riskStatePda, { limit: 1, commitment: 'confirmed' }],
          }),
        });
        const payload = (await response.json()) as {
          result?: Array<{ signature?: string }>;
        };
        if (!cancelled) {
          setLatestTxSignature(payload.result?.[0]?.signature ?? null);
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
  }, [oracleSnapshot?.risk_state_pda]);

  return (
    <div className="py-6 md:py-10">
      {/* ===================== HEADER ===================== */}
      <div className="mb-8 flex flex-col gap-5 border-b border-zinc-800 pb-6 sm:mb-10 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center border transition-all duration-500 sm:h-12 sm:w-12',
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
            <h1 className="text-base font-bold uppercase tracking-tight sm:text-xl md:text-2xl 3xl:text-3xl">
              System App <span className="font-normal text-zinc-500">{assetSymbol} Risk Feed</span>
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
            <div className="mt-2 flex min-w-0 items-start gap-2 text-[10px] leading-relaxed text-zinc-500">
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
                State PDA:{' '}
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
        <div className="flex shrink-0 flex-col gap-3 md:items-end">
          <label className="min-w-[12rem] border border-zinc-800 bg-black/40 px-3 py-2 text-left">
            <div className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Tracked LST</div>
            <select
              value={selectedLstId}
              onChange={(event) => onSelectLstId(event.target.value as SupportedLstId)}
              className="mt-2 w-full bg-transparent text-sm font-bold uppercase tracking-[0.08em] text-white outline-none"
            >
              {SUPPORTED_LSTS.map((asset) => (
                <option key={asset.lstId} value={asset.lstId} className="bg-zinc-950 text-white">
                  {asset.symbol} • {asset.label}
                </option>
              ))}
            </select>
          </label>
          <div
            className={cn(
              'border px-4 py-3 text-left md:text-right',
              globalState.regime_flag === 1 ? 'border-emergency-red/40 bg-emergency-red/5' : 'border-solana-green/40 bg-solana-green/5',
            )}
          >
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Risk Regime</div>
            <div
              className={cn(
                'mt-1 text-sm font-bold uppercase tracking-[0.1em] sm:text-base',
                globalState.regime_flag === 1 ? 'text-emergency-red' : 'text-solana-green',
              )}
            >
              {globalState.regime_flag === 1 ? 'CRITICAL UNSTABLE' : 'STABLE / MONITORED'}
            </div>
          </div>
        </div>
      </div>

      {/* ===================== KPI STRIP ===================== */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4"
      >
        <motion.div
          variants={itemVariants}
          className={cn(
            'relative overflow-hidden border p-3 sm:p-4',
            globalState.regime_flag === 1 ? 'border-emergency-red/40' : 'border-zinc-800',
          )}
        >
          <div className="mb-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.12em] text-zinc-500 sm:text-[10px]">
            <Activity size={11} /> {assetSymbol}/{baseSymbol} Premium
          </div>
          <div
            className={cn(
              'mono-data truncate text-xl font-bold transition-colors duration-500 sm:text-2xl md:text-3xl',
              globalState.regime_flag === 1 ? 'text-emergency-red' : 'text-white',
            )}
          >
            {((marketSnapshot?.spread_pct ?? globalState.spread) * 100).toFixed(3)}%
          </div>
          <div className="mt-1 truncate text-[9px] uppercase tracking-[0.1em] text-zinc-600 sm:text-[10px]">
            Tick {marketFreshness}
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="border border-zinc-800 p-3 sm:p-4">
          <div className="mb-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.12em] text-zinc-500 sm:text-[10px]">
            <Zap size={11} /> Volatility σ
          </div>
          <div className="mono-data truncate text-xl font-bold sm:text-2xl md:text-3xl">
            {(globalState.sigma * 100).toFixed(4)}%
          </div>
          <div className="mt-2 h-1 w-full bg-zinc-900">
            <motion.div
              className={cn(
                'h-full',
                globalState.regime_flag === 1 ? 'bg-emergency-red' : 'bg-solana-green',
              )}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(globalState.sigma * 5000, 100)}%` }}
            />
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="border border-zinc-800 p-3 sm:p-4">
          <div className="mb-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.12em] text-zinc-500 sm:text-[10px]">
            <Cpu size={11} /> z-score
          </div>
          <div
            className={cn(
              'mono-data truncate text-xl font-bold sm:text-2xl md:text-3xl',
              Math.abs(globalState.z_score) >= 2.5 ? 'text-emergency-red' : 'text-white',
            )}
          >
            {formatSigned(globalState.z_score, 3)}
          </div>
          <div className="mt-1 truncate text-[9px] uppercase tracking-[0.1em] text-zinc-600 sm:text-[10px]">
            Trigger ≥ 2.5
          </div>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className={cn(
            'border p-3 transition-all duration-500 sm:p-4',
            globalState.regime_flag === 1
              ? 'border-emergency-red bg-emergency-red/10'
              : 'border-solana-green bg-solana-green/10',
          )}
        >
          <div className="mb-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.12em] text-zinc-500 sm:text-[10px]">
            <Lock size={11} /> Suggested LTV
          </div>
          <div
            className={cn(
              'mono-data truncate text-xl font-bold sm:text-2xl md:text-3xl',
              globalState.regime_flag === 1 ? 'text-emergency-red' : 'text-solana-green',
            )}
          >
            {(globalState.suggested_ltv * 100).toFixed(1)}%
          </div>
          <div className="relative mt-2 h-1 w-full overflow-hidden bg-black/40">
            <div
              className={cn(
                'h-full',
                globalState.regime_flag === 1 ? 'bg-emergency-red' : 'bg-solana-green',
              )}
              style={{ width: `${globalState.suggested_ltv * 100}%` }}
            />
          </div>
        </motion.div>
      </motion.div>

      {/* ===================== MAIN GRID ===================== */}
      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6 lg:gap-8"
      >
        {/* Chart full width */}
        <motion.section variants={itemVariants}>
          <Suspense
            fallback={
              <div className="border border-zinc-800 bg-black p-6 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                Loading chart…
              </div>
            }
          >
            <AppMarketChart
              chartData={chartData}
              accentColor={accentColor}
              heartbeat={heartbeat}
              regimeFlag={globalState.regime_flag}
              baselineSpread={oracleSnapshot?.history?.[0]?.spread_pct ?? 0}
            />
          </Suspense>
        </motion.section>

        {/* Model + LTV policy */}
        <motion.section variants={itemVariants}>
          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="lg:col-span-2">
              <ModelCard
                theta={globalState.theta}
                sigma={globalState.sigma}
                zScore={globalState.z_score}
                mu={oracleSnapshot?.mu}
                adfPvalue={oracleSnapshot?.adf_pvalue}
                isStationary={oracleSnapshot?.is_stationary}
                regime={globalState.regime_flag}
              />
            </div>

            <div
              className={cn(
                'flex flex-col justify-between border p-4 transition-all duration-500 sm:p-5',
                globalState.regime_flag === 1
                  ? 'border-emergency-red bg-emergency-red/10 shadow-brutal-red'
                  : 'border-solana-green bg-solana-green/10 shadow-brutal-green',
              )}
            >
              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                  <Lock size={12} /> Oracle LTV Target
                </div>
                <div className="mono-data text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl">
                  {(globalState.suggested_ltv * 100).toFixed(1)}%
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                  vs. fixed 80% policy baseline
                </div>
              </div>
              <div className="mt-6 space-y-1">
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
                <div className="flex justify-between pt-1 text-[9px] uppercase tracking-[0.1em] text-zinc-600">
                  <span>0%</span>
                  <span>60%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Calculator + Integration Surface */}
        <motion.section variants={itemVariants}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="border border-zinc-800 bg-black p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                <WalletCards size={12} /> Protocol Borrow Calculator
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
                    How a lending protocol could translate PegShield's oracle target into a max borrow for LST collateral.
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 border border-zinc-800 p-3">
                    <span className="pr-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">Fixed 80%</span>
                    <span className="shrink-0 font-mono text-sm text-zinc-300">${fixedBorrowLimitUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border border-solana-green/30 bg-solana-green/5 p-3">
                    <span className="pr-2 text-[10px] uppercase tracking-[0.1em] text-solana-green">PegShield</span>
                    <span className="shrink-0 font-mono text-sm text-solana-green">${oracleBorrowLimitUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border border-zinc-800 p-3">
                    <span className="pr-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">Risk Δ</span>
                    <span className="shrink-0 font-mono text-sm text-white">${oracleDeltaUsd.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-zinc-800 bg-black p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                <Database size={12} /> Integration Surface
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-zinc-800 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Program ID</div>
                  <a
                    href={explorerHref('address', oracleSnapshot?.program_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex break-all font-mono text-[11px] text-zinc-300 transition-colors hover:text-solana-green"
                  >
                    {shortenMiddle(oracleSnapshot?.program_id, 8, 8)}
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
                    {shortenMiddle(oracleSnapshot?.risk_state_pda, 8, 8)}
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
                    {shortenMiddle(oracleSnapshot?.last_updater, 8, 8)}
                  </a>
                </div>
                <div className="border border-zinc-800 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Latest Tx</div>
                  <a
                    href={explorerHref('tx', latestTxSignature ?? undefined)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex break-all font-mono text-[11px] text-zinc-300 transition-colors hover:text-solana-green"
                  >
                    {shortenMiddle(latestTxSignature ?? undefined, 8, 8)}
                  </a>
                </div>
                <a
                  href="https://pegshield.anubhavprasai.com.np/api/oracle-state"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 border border-zinc-800 p-3 transition-colors hover:border-solana-green sm:col-span-2"
                >
                  <span className="min-w-0 text-[10px] uppercase tracking-[0.1em] text-zinc-400">Open live oracle payload</span>
                  <ArrowUpRight size={14} className="shrink-0 text-solana-green" />
                </a>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Snapshot Metadata + Update Health + Logic Terminal */}
        <motion.section variants={itemVariants}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8 xl:grid-cols-3">
            <div className="border border-zinc-800 p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                <FileText size={12} /> Snapshot Metadata
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[10px] leading-relaxed text-zinc-400">
                <dt className="text-zinc-600">Oracle</dt>
                <dd className="min-w-0 truncate text-zinc-300">{oracleSnapshot?.source ?? 'unavailable'}</dd>
                <dt className="text-zinc-600">Market</dt>
                <dd className="min-w-0 truncate text-zinc-300">{marketSnapshot?.source ?? 'unavailable'}</dd>
                <dt className="text-zinc-600">Asset</dt>
                <dd className="min-w-0 truncate text-zinc-300">{oracleSnapshot?.asset_display_name ?? assetSymbol} / {baseSymbol}</dd>
                <dt className="text-zinc-600">Rate</dt>
                <dd className="min-w-0 truncate text-zinc-300">
                  {typeof oracleSnapshot?.reference_rate === 'number' ? oracleSnapshot.reference_rate.toFixed(6) : 'unavailable'}
                </dd>
                <dt className="text-zinc-600">Rate Src</dt>
                <dd className="min-w-0 truncate text-zinc-300">{oracleSnapshot?.reference_rate_source ?? 'unavailable'}</dd>
                <dt className="text-zinc-600">History</dt>
                <dd className="min-w-0 truncate text-zinc-300">{oracleSnapshot?.history_points ?? 0} pts</dd>
                <dt className="text-zinc-600">Authority</dt>
                <dd className="min-w-0 truncate">
                  <a
                    href={explorerHref('address', oracleSnapshot?.authority)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-zinc-300 hover:text-solana-green"
                  >
                    {shortenMiddle(oracleSnapshot?.authority, 6, 6)}
                    <ArrowUpRight size={10} className="shrink-0" />
                  </a>
                </dd>
                <dt className="text-zinc-600">Updater</dt>
                <dd className="min-w-0 truncate">
                  <a
                    href={explorerHref('address', oracleSnapshot?.last_updater)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-zinc-300 hover:text-solana-green"
                  >
                    {shortenMiddle(oracleSnapshot?.last_updater, 6, 6)}
                    <ArrowUpRight size={10} className="shrink-0" />
                  </a>
                </dd>
                <dt className="text-zinc-600">Latest Tx</dt>
                <dd className="min-w-0 truncate">
                  <a
                    href={explorerHref('tx', latestTxSignature ?? undefined)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-zinc-300 hover:text-solana-green"
                  >
                    {shortenMiddle(latestTxSignature ?? undefined, 6, 6)}
                    <ArrowUpRight size={10} className="shrink-0" />
                  </a>
                </dd>
              </dl>
            </div>

            <div className="border border-zinc-800 p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                <TimerReset size={12} /> Update Health
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">Oracle compute</span>
                    <span className={cn('text-[10px] font-bold uppercase tracking-[0.1em]', oracleStatusTone)}>
                      {oracleFreshness}
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
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">Market feed</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-300">
                      {marketFreshness}
                    </span>
                  </div>
                  <div className="h-1 w-full bg-zinc-900">
                    <div
                      className="h-full bg-zinc-500 transition-all duration-500"
                      style={{ width: marketFreshness === 'just now' ? '100%' : marketFreshness === '1 min ago' ? '75%' : '45%' }}
                    />
                  </div>
                </div>
                <div className="border border-zinc-800 bg-zinc-900/30 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-300">Mode</div>
                  <div className="mt-1 text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
                    Live PDA + live market + snapshot fallback
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-600">
                  Updated: <span className="text-zinc-400">{oracleSnapshot?.updated_at_iso ?? 'unavailable'}</span>
                </div>
              </div>
            </div>

            <div className="flex min-h-[320px] flex-col border border-zinc-800 bg-black md:col-span-2 xl:col-span-1">
              <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                  <Terminal size={12} /> Logic Terminal
                </div>
                <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-600">
                  <AlertTriangle
                    size={10}
                    className={
                      globalState.regime_flag === 1 ? 'text-emergency-red' : 'text-zinc-700'
                    }
                  />
                  Live
                </span>
              </div>
              <div className="max-h-[400px] flex-1 overflow-y-auto p-4">
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
            </div>
          </div>
        </motion.section>
      </motion.main>

      <motion.section
        variants={itemVariants}
        initial="hidden"
        animate="show"
        className="mt-12 border border-zinc-800 bg-black p-5 sm:mt-16 sm:p-8 lg:p-10"
      >
        <div className="mb-10 flex flex-col gap-4 border-b border-zinc-900 pb-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-4">
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

        <Suspense
          fallback={
            <div className="border border-zinc-800 bg-zinc-950/50 p-6 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
              Loading wallet demo…
            </div>
          }
        >
          <DevnetWriteGuardDemo oracleSnapshot={oracleSnapshot} />
        </Suspense>
      </motion.section>
    </div>
  );
}

export default function AppPage(props: {
  globalState: RiskState;
  oracleSnapshot: OracleSnapshot | null;
  selectedLstId: SupportedLstId;
  onSelectLstId: (lstId: SupportedLstId) => void;
}) {
  return <AppPageContent {...props} />;
}
