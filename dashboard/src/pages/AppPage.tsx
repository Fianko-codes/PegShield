import { useEffect, useMemo, useState } from 'react';
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
import { cn } from '../types';
import type { LogEntry, MarketSnapshot, OracleSnapshot, RiskState } from '../types';
import { fetchMarketSnapshot } from '../lib/data';

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

function FormulaPanel({
  theta,
  sigma,
  zScore,
  regime,
}: {
  theta: number;
  sigma: number;
  zScore: number;
  regime: number;
}) {
  return (
    <div
      className={cn(
        'relative h-full overflow-hidden border bg-black/40 p-4 backdrop-blur-sm transition-colors duration-500',
        regime === 1
          ? 'border-emergency-red/50 shadow-glow-red'
          : 'border-solana-green/50 shadow-glow-green',
      )}
    >
      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        <Cpu size={12} /> Live OU-Process Calibration
      </div>
      <div className="flex flex-col gap-4">
        <div className="border border-zinc-800/80 bg-zinc-950/60 px-4 py-3 text-center">
          <div className="mono-data text-[11px] uppercase tracking-[0.18em] text-zinc-500 sm:text-sm">
            Ornstein-Uhlenbeck Process
          </div>
          <div className="mt-2 break-words font-mono text-[12px] leading-relaxed text-white sm:text-sm md:text-base">
            dX<span className="align-sub text-[10px]">t</span> = θ(μ - X<span className="align-sub text-[10px]">t</span>)dt + σ dW<span className="align-sub text-[10px]">t</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 font-mono text-[10px] sm:grid-cols-3 sm:gap-2">
          <div className="flex flex-col">
            <span className="text-zinc-500">THETA (REVERSION)</span>
            <motion.span
              key={theta}
              initial={{ opacity: 0.5, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'text-base',
                regime === 1 ? 'text-emergency-red' : 'text-solana-green',
              )}
            >
              {theta.toFixed(4)}
            </motion.span>
          </div>
          <div className="flex flex-col">
            <span className="text-zinc-500">SIGMA (VOL)</span>
            <motion.span
              key={sigma}
              initial={{ opacity: 0.5, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'text-base',
                regime === 1 ? 'text-emergency-red' : 'text-solana-green',
              )}
            >
              {sigma.toFixed(4)}
            </motion.span>
          </div>
          <div className="flex flex-col">
            <span className="text-zinc-500">Z-SCORE</span>
            <motion.span
              key={zScore}
              initial={{ opacity: 0.5, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'text-base',
                regime === 1 ? 'text-emergency-red' : 'text-solana-green',
              )}
            >
              {zScore.toFixed(2)}
            </motion.span>
          </div>
        </div>
      </div>
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
  const [liveTail, setLiveTail] = useState<
    { time: string; spread: number; publishTime: number }[]
  >([]);
  const [heartbeat, setHeartbeat] = useState(false);
  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshot | null>(null);
  const [collateralInput, setCollateralInput] = useState('1000');
  const [clockMs, setClockMs] = useState(() => new Date().getTime());
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
                Canonical State PDA: {shortenMiddle(oracleSnapshot?.risk_state_pda, 10, 8)}
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
                  'mono-data text-3xl font-bold transition-colors duration-500',
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
              <div className="mono-data text-3xl font-bold">
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
                <div
                  className="break-all font-mono lowercase tracking-normal text-zinc-500"
                  title={oracleSnapshot?.authority ?? 'unavailable'}
                >
                  Authority: {shortenMiddle(oracleSnapshot?.authority, 10, 8)}
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
              <FormulaPanel
                theta={globalState.theta}
                sigma={globalState.sigma}
                zScore={globalState.z_score}
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
                  <div className="flex items-baseline gap-2">
                    <span className="mono-data text-4xl font-bold tracking-tighter sm:text-5xl">
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
                    <div className="break-all font-mono text-[11px] text-zinc-300">
                      {oracleSnapshot?.program_id ?? 'unavailable'}
                    </div>
                  </div>
                  <div className="border border-zinc-800 p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-600">Risk State PDA</div>
                    <div className="break-all font-mono text-[11px] text-zinc-300">
                      {oracleSnapshot?.risk_state_pda ?? 'unavailable'}
                    </div>
                  </div>
                  <a
                    href="https://peg-shield.vercel.app/api/oracle-state"
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
    </div>
  );
}
