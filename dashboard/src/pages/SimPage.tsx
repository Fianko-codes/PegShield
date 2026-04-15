import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip
} from 'recharts';
import { 
  AlertTriangle, 
  TrendingDown, 
  ShieldCheck, 
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { cn } from '../types';
import { BrutalistButton } from '../components/BrutalistButton';
import type { SimulationPoint, SimulationSnapshot } from '../types';
import { fetchSimulationSnapshot } from '../lib/data';

const INITIAL_WINDOW = 20;

export default function SimPage() {
  const [isShocking, setIsShocking] = useState(false);
  const [simulation, setSimulation] = useState<SimulationSnapshot | null>(null);
  const [simData, setSimData] = useState<SimulationPoint[]>([]);
  const [cursor, setCursor] = useState(INITIAL_WINDOW);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const snapshot = await fetchSimulationSnapshot();
      if (!snapshot || cancelled) {
        return;
      }
      setSimulation(snapshot);
      setCursor(Math.min(INITIAL_WINDOW, snapshot.points.length));
      setSimData(snapshot.points.slice(0, INITIAL_WINDOW));
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const triggerShock = () => {
    if (isShocking || !simulation || cursor >= simulation.points.length) return;
    setIsShocking(true);

    const interval = setInterval(() => {
      setCursor((currentCursor) => {
        const nextCursor = currentCursor + 1;
        setSimData(simulation.points.slice(0, nextCursor));
        if (nextCursor >= simulation.points.length) {
          clearInterval(interval);
          setIsShocking(false);
        }
        return nextCursor;
      });
    }, 150);
  };

  const resetSim = () => {
    if (!simulation) {
      return;
    }
    setSimData(simulation.points.slice(0, INITIAL_WINDOW));
    setCursor(Math.min(INITIAL_WINDOW, simulation.points.length));
    setIsShocking(false);
  };

  const currentPoint = simData[simData.length - 1];
  const isCritical = currentPoint?.regime_flag === 1;
  const isLoaded = simData.length > 0;
  const replay = simulation?.replay;
  const replayTitle = replay?.title ?? 'Historical depeg replay';
  const replayDescription =
    replay?.description ??
    'Replay a real dislocation and compare the static 80% policy against PegShield tightening.';
  const replayWindow = replay?.event_window_label ?? 'Historical event window';
  const exposureGap = useMemo(() => {
    if (!currentPoint) {
      return 0;
    }
    return Math.max(0, currentPoint.bad_debt_with_oracle - currentPoint.bad_debt_no_oracle);
  }, [currentPoint]);

  const finalDynamicLtv = currentPoint?.ltv_with_oracle ?? 0;
  const finalStaticLtv = currentPoint?.ltv_no_oracle ?? 0;
  const spreadSeries = simData.map((point, index) => ({
    time: new Date(point.timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    sequence: index,
    spread: point.spread_pct,
  }));

  const ltvDeltaText = isLoaded
    ? `${(finalStaticLtv * 100).toFixed(1)}% -> ${(finalDynamicLtv * 100).toFixed(1)}%`
    : 'Awaiting data';

  return (
    <div className="space-y-12 py-8 md:py-12">
      <header className="mx-auto max-w-2xl space-y-4 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-solana-green">Historical Replay</div>
        <h1 className="text-3xl font-bold uppercase tracking-tighter md:text-5xl">Replay <br /> the <span className="text-solana-green">Depeg</span></h1>
        <p className="text-[11px] uppercase leading-relaxed tracking-[0.12em] text-zinc-500 md:text-xs">
          {replayTitle}. Compare the static 80% policy against PegShield&apos;s
          tighter oracle target during a real dislocation.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="space-y-8 border border-zinc-800 bg-black p-5 md:p-8">
            <div className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-widest">Replay Controls</h3>
              <p className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
                Advance the precomputed historical replay for {replayWindow}.
              </p>
            </div>

            <div className="space-y-4">
               <BrutalistButton 
                 variant={isShocking ? 'red' : 'green'} 
                 className="w-full py-6"
                 onClick={triggerShock}
               >
                 {isShocking ? 'REPLAY IN PROGRESS...' : 'REPLAY HISTORICAL EVENT'}
               </BrutalistButton>
               
               <BrutalistButton 
                 variant="zinc" 
                 className="w-full"
                 onClick={resetSim}
               >
                 <div className="flex items-center justify-center gap-2">
                   <RefreshCw size={14} /> RESET WINDOW
                 </div>
               </BrutalistButton>
            </div>

            <div className="pt-6 border-t border-zinc-900 space-y-4">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Theta (Reversion)</span>
                  <span className={cn("text-xs mono-data font-bold", isCritical ? "text-emergency-red" : "text-solana-green")}>
                    {currentPoint ? currentPoint.theta.toFixed(4) : '0.0000'}
                  </span>
               </div>
               <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Spread Regime</span>
                  <span className={cn("text-xs font-bold uppercase", isCritical ? "text-emergency-red" : "text-solana-green")}>
                    {isCritical ? 'STRESSED' : 'MONITORING'}
                  </span>
               </div>
               <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Oracle Adjustment</span>
                  <span className="text-xs mono-data font-bold text-zinc-300">
                    {ltvDeltaText}
                  </span>
               </div>
            </div>
          </div>

          <AnimatePresence>
            {isCritical && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-6 border border-emergency-red bg-emergency-red/10 space-y-4"
              >
                 <div className="flex items-center gap-2 text-emergency-red font-bold uppercase text-xs">
                    <AlertTriangle size={16} /> Oracle Intervention
                 </div>
                 <p className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-300">
                    Replay entered a stressed regime. PegShield cut target LTV to {(finalDynamicLtv * 100).toFixed(1)}%.
                    <span className="text-white font-bold ml-1">Exposure above the tighter policy: {exposureGap.toFixed(1)} USD.</span>
                 </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Visualization */}
        <div className="lg:col-span-8 space-y-6">
          <div className="relative border border-zinc-800 bg-black p-4 sm:p-6">
            <div className="absolute left-4 top-4 z-10 sm:left-6">
              <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-zinc-500">{replayTitle}</div>
            </div>
            <div className="mt-8 h-[260px] w-full sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spreadSeries}>
                  <defs>
                    <linearGradient id="colorSim" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isCritical ? "#FF4B4B" : "#14F195"} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={isCritical ? "#FF4B4B" : "#14F195"} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                  <XAxis dataKey="sequence" hide />
                  <YAxis 
                    stroke="#444" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => `${(val * 100).toFixed(1)}%`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0D0D0D', border: '1px solid #333', fontSize: '10px', fontFamily: 'monospace' }}
                    labelFormatter={(_, payload) => String(payload?.[0]?.payload?.time ?? '')}
                    formatter={(value) => `${(Number(value ?? 0) * 100).toFixed(2)}%`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="spread" 
                    stroke={isCritical ? "#FF4B4B" : "#14F195"} 
                    strokeWidth={2}
                    fill="url(#colorSim)" 
                    animationDuration={0}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-zinc-800 bg-black p-5 sm:p-6">
               <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                  <TrendingDown size={12} className="text-emergency-red" /> Static Policy
               </div>
               <div className="text-3xl font-bold mono-data text-zinc-400">{(finalStaticLtv * 100).toFixed(1)}%</div>
               <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.08em] text-emergency-red">
                  Exposure gap during replay: {(currentPoint?.bad_debt_no_oracle ?? 0).toFixed(1)} USD
               </div>
            </div>
            <div className={cn(
              "p-6 border transition-all duration-500",
              isCritical ? "border-solana-green bg-solana-green/5 shadow-brutal-green" : "border-zinc-800 bg-black"
            )}>
               <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                  <ShieldCheck size={12} className="text-solana-green" /> PegShield Policy
               </div>
               <div className={cn(
                 "text-3xl font-bold mono-data transition-colors",
                 isCritical ? "text-solana-green" : "text-zinc-400"
               )}>
                 {(finalDynamicLtv * 100).toFixed(1)}%
               </div>
               <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">
                  Status: {isCritical ? "TIGHTENED" : "MONITORING"}
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Narrative Footer */}
      <section className="mx-auto max-w-4xl border border-zinc-900 bg-zinc-950 p-6 text-center sm:p-12">
         <h2 className="mb-4 text-2xl font-bold uppercase tracking-tighter">What This Replay Shows</h2>
         <p className="mb-8 text-[11px] uppercase leading-relaxed tracking-[0.12em] text-zinc-500 md:text-xs">
            {replayDescription}
            It shows how the oracle target tightens as spread instability rises before a lending integration absorbs the move.
         </p>
         <div className="flex justify-center">
            <a href="/app" className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-solana-green hover:underline">
               Explore Full System Metrics <ArrowRight size={14} />
            </a>
         </div>
      </section>
    </div>
  );
}
