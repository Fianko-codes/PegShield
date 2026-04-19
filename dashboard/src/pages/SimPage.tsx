import { useEffect, useMemo, useRef, useState } from 'react';
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
  AlertTriangle,
  TrendingDown,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Radio,
  Clock3,
  Waves,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '../types';
import { BrutalistButton } from '../components/BrutalistButton';
import type {
  SimulationPoint,
  SimulationScenario,
  SimulationSnapshot,
  SimulationSummary,
} from '../types';
import { fetchSimulationSnapshot } from '../lib/data';

const FALLBACK_INITIAL_WINDOW = 20;

function createLegacyScenario(snapshot: SimulationSnapshot): SimulationScenario {
  return {
    id: snapshot.replay?.id ?? 'legacy_replay',
    title: snapshot.replay?.title ?? 'Historical depeg replay',
    description:
      snapshot.replay?.description ??
      'Replay a real dislocation and compare the static 80% policy against PegShield tightening.',
    kind: snapshot.replay?.kind ?? 'historical',
    asset_symbol: snapshot.replay?.asset_symbol,
    base_symbol: snapshot.replay?.base_symbol,
    reference_ratio: snapshot.replay?.reference_ratio,
    event_window_label: snapshot.replay?.event_window_label ?? 'Historical event window',
    warmup_points: snapshot.replay?.warmup_points,
    scenario_points: snapshot.replay?.scenario_points ?? snapshot.points.length,
    fixture_path: snapshot.replay?.fixture_path,
    sources: snapshot.replay?.sources ?? [],
    initial_window: snapshot.replay?.initial_window ?? Math.min(FALLBACK_INITIAL_WINDOW, snapshot.points.length),
    points: snapshot.points,
    summary: snapshot.summary,
  };
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export default function SimPage() {
  const [isReplaying, setIsReplaying] = useState(false);
  const [simulation, setSimulation] = useState<SimulationSnapshot | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(FALLBACK_INITIAL_WINDOW);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearReplayInterval = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const snapshot = await fetchSimulationSnapshot();
      if (!snapshot || cancelled) {
        return;
      }

      setSimulation(snapshot);
      const initialScenario =
        snapshot.scenarios?.find((scenario) => scenario.id === snapshot.default_scenario_id) ??
        snapshot.scenarios?.[0] ??
        createLegacyScenario(snapshot);
      const initialWindow = Math.min(
        initialScenario.initial_window ?? FALLBACK_INITIAL_WINDOW,
        initialScenario.points.length,
      );
      setSelectedScenarioId(initialScenario.id);
      setCursor(initialWindow);
    };

    void load();

    return () => {
      cancelled = true;
      clearReplayInterval();
    };
  }, []);

  const scenarios = useMemo(() => {
    if (!simulation) {
      return [];
    }
    return simulation.scenarios?.length ? simulation.scenarios : [createLegacyScenario(simulation)];
  }, [simulation]);

  const selectedScenario = useMemo(() => {
    if (scenarios.length === 0) {
      return null;
    }
    return scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0];
  }, [scenarios, selectedScenarioId]);

  const resetScenario = (scenario: SimulationScenario | null) => {
    clearReplayInterval();
    setIsReplaying(false);
    if (!scenario) {
      return;
    }
    const initialWindow = Math.min(
      scenario.initial_window ?? FALLBACK_INITIAL_WINDOW,
      scenario.points.length,
    );
    setCursor(initialWindow);
  };

  const selectScenario = (scenario: SimulationScenario) => {
    if (scenario.id === selectedScenarioId) {
      return;
    }
    setSelectedScenarioId(scenario.id);
    resetScenario(scenario);
  };

  const triggerReplay = () => {
    if (isReplaying || !selectedScenario || cursor >= selectedScenario.points.length) {
      return;
    }

    const pointsLength = selectedScenario.points.length;
    setIsReplaying(true);
    intervalRef.current = setInterval(() => {
      setCursor((currentCursor) => {
        const nextCursor = currentCursor + 1;
        if (nextCursor >= pointsLength) {
          clearReplayInterval();
          setIsReplaying(false);
          return pointsLength;
        }
        return nextCursor;
      });
    }, 140);
  };

  const resetReplay = () => {
    resetScenario(selectedScenario);
  };

  const simData = useMemo(() => {
    if (!selectedScenario) {
      return [] as SimulationPoint[];
    }
    return selectedScenario.points.slice(0, Math.min(cursor, selectedScenario.points.length));
  }, [selectedScenario, cursor]);

  const currentPoint = simData[simData.length - 1];
  const summary: SimulationSummary | null = selectedScenario?.summary ?? null;
  const isCritical = currentPoint?.regime_flag === 1;
  const progressRatio =
    selectedScenario && selectedScenario.points.length > 0
      ? cursor / selectedScenario.points.length
      : 0;
  const currentLossPrevented = currentPoint
    ? Math.max(0, currentPoint.shortfall_static - currentPoint.shortfall_dynamic)
    : 0;
  const peakLossPrevented = summary?.max_loss_prevented ?? 0;
  const criticalShare = summary?.critical_duration_ratio ?? 0;
  const peakLtvCut = summary?.peak_ltv_cut ?? 0;

  const chartData = simData.map((point, index) => ({
    time: new Date(point.timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    sequence: index,
    spread: point.peg_deviation ?? point.spread_pct,
    staticShortfall: point.shortfall_static,
    oracleShortfall: point.shortfall_dynamic,
  }));

  const criticalStartIndex = summary?.critical_start_index ?? undefined;
  const controlLabel = isReplaying ? 'REPLAY RUNNING...' : 'RUN SCENARIO';

  return (
    <div className="space-y-12 py-8 md:space-y-14 md:py-12">
      <header className="mx-auto max-w-3xl space-y-5 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-solana-green">
          Scenario Lab
        </div>
        <h1 className="text-3xl font-bold uppercase tracking-tighter md:text-5xl">
          Stress-Test <br /> the <span className="text-solana-green">Black Swan Window</span>
        </h1>
        <p className="text-[11px] uppercase leading-relaxed tracking-[0.12em] text-zinc-500 md:text-xs">
          One replay is not enough. This lab lets you compare multiple collapse shapes, watch the
          regime flip in motion, and see where PegShield prevents loss before a lender gets trapped.
        </p>
      </header>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
              Choose Scenario
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-600">
              Historical contagion plus synthetic black-swan stress shapes
            </div>
          </div>
          <div className="hidden text-[10px] uppercase tracking-[0.1em] text-zinc-600 sm:block">
            {scenarios.length} scenarios loaded
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          {scenarios.map((scenario) => {
            const selected = scenario.id === selectedScenario?.id;
            const scenarioCritical = (scenario.summary.critical_duration_ratio ?? 0) > 0.35;

            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => selectScenario(scenario)}
                className={cn(
                  'border p-5 text-left transition-all duration-300',
                  selected
                    ? 'border-solana-green bg-solana-green/8 shadow-brutal-green'
                    : 'border-zinc-800 bg-black hover:border-zinc-600',
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                      {scenario.kind ?? 'scenario'}
                    </div>
                    <div className="mt-2 text-sm font-bold uppercase leading-tight tracking-[0.06em] text-white">
                      {scenario.title}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'shrink-0 border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em]',
                      scenarioCritical
                        ? 'border-emergency-red/60 text-emergency-red'
                        : 'border-solana-green/40 text-solana-green',
                    )}
                  >
                    {Math.round((scenario.summary.critical_duration_ratio ?? 0) * 100) > 0
                      ? `${Math.round((scenario.summary.critical_duration_ratio ?? 0) * 100)}% critical`
                      : 'stable finish'}
                  </div>
                </div>
                <div className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
                  {scenario.tagline ?? scenario.description}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-zinc-900 pt-4">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.08em] text-zinc-600">
                      Peak prevented
                    </div>
                    <div className="mt-1 text-xs font-bold text-solana-green">
                      {formatUsd(scenario.summary.max_loss_prevented ?? 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.08em] text-zinc-600">
                      Peak LTV cut
                    </div>
                    <div className="mt-1 text-xs font-bold text-white">
                      {formatPct(scenario.summary.peak_ltv_cut ?? 0)}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {selectedScenario && (
        <>
          <section className="grid grid-cols-1 gap-8 xl:grid-cols-12">
            <div className="space-y-6 xl:col-span-4">
              <div className="space-y-8 border border-zinc-800 bg-black p-5 md:p-8">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    <ShieldAlert size={12} /> Active Scenario
                  </div>
                  <h2 className="text-2xl font-bold uppercase tracking-tight">
                    {selectedScenario.title}
                  </h2>
                  <p className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
                    {selectedScenario.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-zinc-800 p-3">
                    <div className="text-[9px] uppercase tracking-[0.08em] text-zinc-600">
                      Risk focus
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                      {selectedScenario.risk_focus ?? 'Stress test'}
                    </div>
                  </div>
                  <div className="border border-zinc-800 p-3">
                    <div className="text-[9px] uppercase tracking-[0.08em] text-zinc-600">
                      Event window
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                      {selectedScenario.event_window_label}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <BrutalistButton
                    variant={isReplaying ? 'red' : 'green'}
                    className="w-full py-6"
                    onClick={triggerReplay}
                  >
                    {controlLabel}
                  </BrutalistButton>

                  <BrutalistButton variant="zinc" className="w-full" onClick={resetReplay}>
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw size={14} /> RESET WINDOW
                    </div>
                  </BrutalistButton>
                </div>

                <div className="space-y-3 border-t border-zinc-900 pt-6">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                      Replay progress
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-300">
                      {Math.round(progressRatio * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-zinc-900">
                    <div
                      className={cn(
                        'h-full transition-all duration-300',
                        isCritical ? 'bg-emergency-red' : 'bg-solana-green',
                      )}
                      style={{ width: `${progressRatio * 100}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 border-t border-zinc-900 pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                      Current theta
                    </span>
                    <span
                      className={cn(
                        'text-xs font-bold',
                        isCritical ? 'text-emergency-red' : 'text-solana-green',
                      )}
                    >
                      {currentPoint ? currentPoint.theta.toFixed(4) : '0.0000'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                      Current regime
                    </span>
                    <span
                      className={cn(
                        'text-xs font-bold uppercase',
                        isCritical ? 'text-emergency-red' : 'text-solana-green',
                      )}
                    >
                      {isCritical ? 'critical' : 'monitoring'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                      Oracle adjustment
                    </span>
                    <span className="text-xs font-bold text-zinc-300">
                      {currentPoint
                        ? `${formatPct(currentPoint.ltv_no_oracle)} -> ${formatPct(currentPoint.ltv_with_oracle)}`
                        : 'awaiting'}
                    </span>
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isCritical && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="space-y-3 border border-emergency-red bg-emergency-red/10 p-6"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold uppercase text-emergency-red">
                      <AlertTriangle size={16} /> Live intervention window
                    </div>
                    <p className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-300">
                      The replay is inside the dangerous pocket now. PegShield has already tightened
                      to {formatPct(currentPoint?.ltv_with_oracle ?? 0)} and is currently preventing{' '}
                      <span className="font-bold text-solana-green">
                        {formatUsd(currentLossPrevented)}
                      </span>{' '}
                      of loss.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-6 xl:col-span-8">
              <div className="relative border border-zinc-800 bg-black p-4 sm:p-6">
                <div className="absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center justify-between gap-3 sm:left-6 sm:right-6">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                      Peg deviation path
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-700">
                      {selectedScenario.tagline}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-zinc-600">
                    <Radio
                      size={10}
                      className={cn(isReplaying ? 'animate-pulse text-solana-green' : 'text-zinc-700')}
                    />
                    {selectedScenario.asset_symbol ?? 'LST'} / {selectedScenario.base_symbol ?? 'SOL'}
                  </div>
                </div>

                <div className="mt-16 h-[280px] w-full sm:h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="scenarioSpread" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor={isCritical ? '#FF4B4B' : '#14F195'}
                            stopOpacity={0.32}
                          />
                          <stop
                            offset="95%"
                            stopColor={isCritical ? '#FF4B4B' : '#14F195'}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                      <XAxis dataKey="sequence" hide />
                      <YAxis
                        stroke="#444"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${(value * 100).toFixed(1)}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0D0D0D',
                          border: '1px solid #333',
                          fontSize: '10px',
                          fontFamily: 'monospace',
                        }}
                        labelFormatter={(_, payload) => String(payload?.[0]?.payload?.time ?? '')}
                        formatter={(value) => `${(Number(value ?? 0) * 100).toFixed(2)}%`}
                      />
                      <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="5 5" />
                      {criticalStartIndex != null && criticalStartIndex < chartData.length && (
                        <ReferenceLine
                          x={criticalStartIndex}
                          stroke="#FF4B4B"
                          strokeDasharray="4 4"
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="spread"
                        stroke={isCritical ? '#FF4B4B' : '#14F195'}
                        strokeWidth={2}
                        fill="url(#scenarioSpread)"
                        animationDuration={0}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="border border-zinc-800 bg-black p-5">
                  <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                    <TrendingDown size={12} className="text-emergency-red" /> Static exposure
                  </div>
                  <div className="text-2xl font-bold text-zinc-300">
                    {formatUsd(currentPoint?.shortfall_static ?? 0)}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-zinc-600">
                    Peak {formatUsd(summary?.peak_shortfall_static ?? 0)}
                  </div>
                </div>

                <div
                  className={cn(
                    'border p-5 transition-colors duration-300',
                    isCritical
                      ? 'border-solana-green bg-solana-green/6 shadow-brutal-green'
                      : 'border-zinc-800 bg-black',
                  )}
                >
                  <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                    <ShieldCheck size={12} className="text-solana-green" /> Loss prevented
                  </div>
                  <div className="text-2xl font-bold text-solana-green">
                    {formatUsd(currentLossPrevented)}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-zinc-600">
                    Peak {formatUsd(peakLossPrevented)}
                  </div>
                </div>

                <div className="border border-zinc-800 bg-black p-5">
                  <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                    <Clock3 size={12} className="text-zinc-400" /> Time in critical
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {(criticalShare * 100).toFixed(0)}%
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-zinc-600">
                    {summary?.critical_rows ?? 0} stressed intervals
                  </div>
                </div>

                <div className="border border-zinc-800 bg-black p-5">
                  <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                    <Waves size={12} className="text-zinc-400" /> Peak LTV cut
                  </div>
                  <div className="text-2xl font-bold text-white">{formatPct(peakLtvCut)}</div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-zinc-600">
                    Oracle vs fixed 80% path
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="border border-zinc-900 bg-zinc-950 p-6 sm:p-8">
              <div className="mb-5 text-[10px] font-bold uppercase tracking-[0.14em] text-solana-green">
                What Failed Here
              </div>
              <div className="space-y-4">
                {(selectedScenario.highlights ?? []).map((highlight) => (
                  <div
                    key={highlight}
                    className="border border-zinc-800 bg-black/40 p-4 text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-400"
                  >
                    {highlight}
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-zinc-900 bg-zinc-950 p-6 sm:p-8">
              <div className="mb-5 text-[10px] font-bold uppercase tracking-[0.14em] text-solana-green">
                Outcome Snapshot
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 border border-zinc-800 p-4">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                    Final oracle LTV
                  </span>
                  <span className="text-sm font-bold text-solana-green">
                    {formatPct(summary?.final_dynamic_ltv ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 border border-zinc-800 p-4">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                    Final static LTV
                  </span>
                  <span className="text-sm font-bold text-zinc-300">
                    {formatPct(summary?.final_static_ltv ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 border border-zinc-800 p-4">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                    Final prevented loss
                  </span>
                  <span className="text-sm font-bold text-solana-green">
                    {formatUsd(summary?.final_loss_prevented ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 border border-zinc-800 p-4">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                    Recovery status
                  </span>
                  <span
                    className={cn(
                      'text-sm font-bold uppercase',
                      summary?.recovered_to_monitoring ? 'text-solana-green' : 'text-emergency-red',
                    )}
                  >
                    {summary?.recovered_to_monitoring ? 'Monitoring' : 'Still stressed'}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="mx-auto max-w-5xl border border-zinc-900 bg-zinc-950 p-6 text-center sm:p-10">
        <h2 className="mb-4 text-2xl font-bold uppercase tracking-tighter">
          Scenario Lab Takeaway
        </h2>
        <p className="mx-auto max-w-3xl text-[11px] uppercase leading-relaxed tracking-[0.12em] text-zinc-500 md:text-xs">
          A credible risk oracle should look good in more than one movie. This lab shows PegShield
          across slow contagion, gap-down liquidity failure, reflexive bank-run behavior, and
          fast snapback repricing.
        </p>
        <div className="mt-8 flex justify-center">
          <a
            href="/app"
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-solana-green hover:underline"
          >
            Explore Full System Metrics <ArrowRight size={14} />
          </a>
        </div>
      </section>
    </div>
  );
}
