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

function TerminalLine({ log }: { log: LogEntry }) {
  const colorClass =
    log.type === 'alert'
      ? 'text-emergency-red'
      : log.type === 'success'
        ? 'text-solana-green'
        : 'text-zinc-400';

  return (
    <div className="mb-1 flex gap-2 font-mono text-xs">
      <span className="text-zinc-600">[{log.timestamp}]</span>
      <span className={cn(colorClass)}>{log.message}</span>
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
      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
        <Cpu size={12} /> Live OU-Process Calibration
      </div>
      <div className="flex flex-col gap-4">
        <div className="border border-zinc-800/80 bg-zinc-950/60 px-4 py-3 text-center">
          <div className="mono-data text-sm uppercase tracking-[0.25em] text-zinc-500">
            Ornstein-Uhlenbeck Process
          </div>
          <div className="mt-2 font-mono text-sm text-white md:text-base">
            dX<span className="align-sub text-[10px]">t</span> = θ(μ - X<span className="align-sub text-[10px]">t</span>)dt + σ dW<span className="align-sub text-[10px]">t</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
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
        message: `PDA ${oracleSnapshot.risk_state_pda ?? 'unavailable'} on ${oracleSnapshot.network ?? 'devnet'}`,
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

    void loadMarket();
    const interval = window.setInterval(() => {
      void loadMarket();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [oracleSnapshot]);

  return (
    <div className="py-4">
      <div className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
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
          <div>
            <h1 className="text-xl font-bold uppercase tracking-tight">
              System App <span className="font-normal text-zinc-500">mSOL Risk Feed</span>
            </h1>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span
                className={cn(
                  'h-2 w-2 animate-pulse rounded-full',
                  globalState.regime_flag === 1 ? 'bg-emergency-red' : 'bg-solana-green',
                )}
              />
              Canonical State PDA: {oracleSnapshot?.risk_state_pda ?? 'snapshot unavailable'}
            </div>
          </div>
        </div>
        <div className="hidden text-right md:block">
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
        className="grid grid-cols-1 gap-6 lg:grid-cols-12"
      >
        <motion.section variants={itemVariants} className="space-y-6 lg:col-span-3">
          <div className="space-y-4">
            <div className="relative overflow-hidden border border-zinc-800 p-4">
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase text-zinc-500">
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
            </div>

            <div className="border border-zinc-800 p-4">
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase text-zinc-500">
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
              <div className="mb-3 text-[10px] uppercase text-zinc-500">Snapshot Metadata</div>
              <div className="space-y-2 text-[10px] uppercase tracking-wider text-zinc-400">
                <div>Oracle Source: {oracleSnapshot?.source ?? 'unavailable'}</div>
                <div>Market Source: {marketSnapshot?.source ?? 'unavailable'}</div>
                <div>Updated: {oracleSnapshot?.updated_at_iso ?? 'unavailable'}</div>
                <div>
                  Market Tick: {marketSnapshot ? new Date(marketSnapshot.publish_time * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }) : 'unavailable'}
                </div>
                <div>History: {oracleSnapshot?.history_points ?? 0} points</div>
                <div className="break-all leading-relaxed">
                  Authority: {oracleSnapshot?.authority ?? 'unavailable'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 border border-zinc-800 bg-zinc-900/30 p-4">
              <FileText className="text-zinc-500" />
              <div>
                <div className="text-xs font-bold uppercase">Dashboard Mode</div>
                <div className="text-[10px] uppercase text-zinc-500">
                  Live PDA + live market + snapshot fallback
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="space-y-6 lg:col-span-6">
          <div className="space-y-6">
            <div className="relative border border-zinc-800 bg-black p-6">
              <div className="absolute left-6 top-4 z-10">
                <div className="mb-1 text-[10px] uppercase text-zinc-500">
                  Live Market Premium
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-600">
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
                <div className="mt-1 text-[10px] uppercase tracking-widest text-zinc-700">
                  Snapshot base + live tail overlay
                </div>
              </div>
              <div className="mt-8 h-[300px] w-full">
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
                  <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
                    <Lock size={12} /> Suggested LTV
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="mono-data text-5xl font-bold tracking-tighter">
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
          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="lg:col-span-3">
          <div className="flex h-full flex-col border border-zinc-800 bg-black">
            <div className="border-b border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-zinc-500">
                <Terminal size={12} /> Logic Terminal
              </div>
            </div>
            <div className="max-h-[600px] flex-1 overflow-y-auto p-4">
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
            <div className="flex justify-between border-t border-zinc-800 p-3 font-mono text-[10px] uppercase text-zinc-600">
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
