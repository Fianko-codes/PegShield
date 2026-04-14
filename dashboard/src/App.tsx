import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine 
} from 'recharts';
import { 
  Activity, 
  AlertTriangle, 
  Cpu, 
  FileText, 
  Terminal, 
  ShieldCheck, 
  ChevronRight,
  Zap,
  Lock,
  Database
} from 'lucide-react';
import { InlineMath } from 'react-katex';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- UTILS ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- TYPES ---
interface RiskState {
  lst_id: string;
  theta: number;
  sigma: number;
  regime_flag: number; // 0 = Normal, 1 = Critical
  suggested_ltv: number;
  z_score: number;
  spread: number;
  timestamp: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'alert' | 'success';
}

// --- MOCK DATA GENERATOR ---
const generateMockData = (count: number) => {
  const data = [];
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const ts = now - i * 60000; // 1 min steps
    // Simulate some drift and mean reversion
    const baseSpread = -0.005; // -0.5%
    const noise = (Math.random() - 0.5) * 0.002;
    data.push({
      time: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      spread: baseSpread + noise,
      ltv: 0.75 + (Math.random() - 0.5) * 0.05
    });
  }
  return data;
};

// --- COMPONENTS ---

const TerminalLine = ({ log }: { log: LogEntry }) => {
  const colorClass = log.type === 'alert' ? 'text-emergency-red' : log.type === 'success' ? 'text-solana-green' : 'text-zinc-400';
  return (
    <div className="flex gap-2 font-mono text-xs mb-1">
      <span className="text-zinc-600">[{log.timestamp}]</span>
      <span className={cn(colorClass)}>{log.message}</span>
    </div>
  );
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

const MathOverlay = ({ theta, sigma, zScore, regime }: { theta: number, sigma: number, zScore: number, regime: number }) => {
  return (
    <div className={cn(
      "border p-4 bg-black/40 backdrop-blur-sm relative overflow-hidden transition-colors duration-500 h-full",
      regime === 1 ? "border-emergency-red/50 shadow-glow-red" : "border-solana-green/50 shadow-glow-green"
    )}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2">
        <Cpu size={12} /> Live OU-Process Calibration
      </div>
      <div className="flex flex-col gap-4">
        <div className="text-lg md:text-xl text-center py-2">
          <InlineMath math={`dx_t = \\theta (\\mu - x_t)dt + \\sigma dW_t`} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
          <div className="flex flex-col">
            <span className="text-zinc-500">THETA (REVERSION)</span>
            <motion.span 
              key={theta}
              initial={{ opacity: 0.5, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn("text-base", regime === 1 ? "text-emergency-red" : "text-solana-green")}
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
              className={cn("text-base", regime === 1 ? "text-emergency-red" : "text-solana-green")}
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
              className={cn("text-base", regime === 1 ? "text-emergency-red" : "text-solana-green")}
            >
              {zScore.toFixed(2)}
            </motion.span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [riskState, setRiskState] = useState<RiskState>({
    lst_id: 'mSOL',
    theta: 0.1245,
    sigma: 0.0032,
    regime_flag: 0,
    suggested_ltv: 0.78,
    z_score: -0.42,
    spread: -0.0051,
    timestamp: Date.now()
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chartData, setChartData] = useState(generateMockData(50));
  const [accentColor, setAccentColor] = useState('#14F195');

  // Sync accent color with regime
  useEffect(() => {
    setAccentColor(riskState.regime_flag === 1 ? '#FF4B4B' : '#14F195');
  }, [riskState.regime_flag]);

  // Simulation: Add random logs and update state
  useEffect(() => {
    const addLog = (msg: string, type: 'info' | 'alert' | 'success' = 'info') => {
      const newLog = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        message: msg,
        type
      };
      setLogs(prev => [newLog, ...prev].slice(0, 50));
    };

    const interval = setInterval(() => {
      // Simulate price movement
      const newSpread = riskState.spread + (Math.random() - 0.5) * 0.0005;
      const newRegime = Math.random() > 0.95 ? (riskState.regime_flag === 0 ? 1 : 0) : riskState.regime_flag;
      
      if (newRegime !== riskState.regime_flag) {
        addLog(newRegime === 1 ? "CRITICAL: REGIME BREAK DETECTED" : "RECOVERY: STATIONARITY RESTORED", newRegime === 1 ? 'alert' : 'success');
      }

      setRiskState(prev => ({
        ...prev,
        spread: newSpread,
        regime_flag: newRegime,
        suggested_ltv: newRegime === 1 ? 0.65 : 0.75 + (Math.random() * 0.05),
        z_score: (newSpread + 0.005) / 0.003,
        theta: 0.12 + (Math.random() * 0.02),
        sigma: 0.003 + (Math.random() * 0.001)
      }));

      setChartData(prev => [...prev.slice(1), {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        spread: newSpread,
        ltv: riskState.suggested_ltv
      }]);

      if (Math.random() > 0.7) {
        addLog(`ADF Test p-value: ${(Math.random() * 0.05).toFixed(4)}... [VERIFIED]`, 'success');
      }
    }, 3000);

    // Initial logs
    addLog("ORACLE NODE INITIALIZED: DEVNET-01", "success");
    addLog("FETCHING LATEST PYTH mSOL/SOL SPREAD...", "info");
    addLog("CALIBRATING OU-PROCESS PARAMETERS...", "info");

    return () => clearInterval(interval);
  }, [riskState.spread, riskState.regime_flag, riskState.suggested_ltv]);

  return (
    <div className={cn(
      "min-h-screen bg-background text-white p-4 font-sans selection:bg-solana-green selection:text-black transition-colors duration-1000",
      riskState.regime_flag === 1 && "regime-critical selection:bg-emergency-red"
    )}>
      {/* HEADER */}
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-4"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 flex items-center justify-center border transition-all duration-500",
            riskState.regime_flag === 1 ? "border-emergency-red shadow-glow-red" : "border-solana-green shadow-glow-green"
          )}>
            <ShieldCheck className={riskState.regime_flag === 1 ? "text-emergency-red" : "text-solana-green"} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase">Risk Oracle <span className="text-zinc-500 font-normal">mSOL/SOL</span></h1>
            <div className="flex items-center gap-2 text-[10px] mono-data text-zinc-500">
              <span className={cn("w-2 h-2 rounded-full animate-pulse", riskState.regime_flag === 1 ? "bg-emergency-red" : "bg-solana-green")}></span>
              DEVNET-STABLE // SLOT: 294,851,023
            </div>
          </div>
        </div>
        <div className="flex gap-6 items-center">
           <div className="hidden md:block">
              <div className="text-[10px] text-zinc-500 text-right uppercase">Market Status</div>
              <div className={cn("text-xs font-bold uppercase", riskState.regime_flag === 1 ? "text-emergency-red" : "text-solana-green")}>
                {riskState.regime_flag === 1 ? "High Risk / De-Peg Potential" : "Normal / Mean Reverting"}
              </div>
           </div>
           <div className="p-2 border border-zinc-800 hover:border-zinc-600 transition-colors cursor-pointer">
              <Database size={18} className="text-zinc-400" />
           </div>
        </div>
      </motion.header>

      {/* MAIN GRID */}
      <motion.main 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        
        {/* COLUMN 1: LIVE RISK METRICS */}
        <motion.div variants={itemVariants} className="lg:col-span-3 space-y-6">
          <div className="space-y-4">
            <div className="border border-zinc-800 p-4 relative overflow-hidden group">
              <div className={cn(
                "absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-transparent to-transparent transition-colors duration-1000",
                riskState.regime_flag === 1 ? "from-emergency-red/10" : "from-solana-green/5"
              )}></div>
              <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-2 mb-1">
                <Activity size={12} /> Current Spread
              </div>
              <div className={cn(
                "text-3xl font-bold mono-data transition-colors duration-500",
                riskState.regime_flag === 1 ? "text-emergency-red" : "text-white"
              )}>
                {(riskState.spread * 100).toFixed(3)}%
              </div>
              <div className="text-[10px] text-zinc-500 mt-2 flex justify-between">
                <span>24H HIGH: -0.21%</span>
                <span>24H LOW: -0.84%</span>
              </div>
            </div>

            <div className="border border-zinc-800 p-4 relative overflow-hidden group">
              <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-2 mb-1">
                <Zap size={12} /> Volatility (Sigma)
              </div>
              <div className="text-3xl font-bold mono-data">
                {(riskState.sigma * 100).toFixed(4)}%
              </div>
              <div className="w-full bg-zinc-900 h-1 mt-3">
                <motion.div 
                  className={cn("h-full", riskState.regime_flag === 1 ? "bg-emergency-red" : "bg-solana-green")}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(riskState.sigma * 5000, 100)}%` }}
                />
              </div>
            </div>

            <div className="border border-zinc-800 p-4">
              <div className="text-[10px] text-zinc-500 uppercase mb-3">Model Confidence</div>
              <div className="grid grid-cols-5 gap-1">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className={cn(
                    "h-8 border",
                    i <= (riskState.regime_flag === 1 ? 2 : 4) 
                      ? (riskState.regime_flag === 1 ? "bg-emergency-red/20 border-emergency-red/50" : "bg-solana-green/20 border-solana-green/50") 
                      : "bg-transparent border-zinc-800"
                  )}></div>
                ))}
              </div>
              <div className="text-[10px] text-zinc-500 mt-2 uppercase text-right">
                {riskState.regime_flag === 1 ? "0.32% Confidence Score" : "0.84% Confidence Score"}
              </div>
            </div>

            <div className="p-4 border border-zinc-800 bg-zinc-900/30 flex items-center gap-4 group cursor-pointer hover:border-zinc-700 transition-colors">
              <FileText className="text-zinc-500 group-hover:text-solana-green transition-colors" />
              <div>
                <div className="text-xs font-bold uppercase">Whitepaper v2.1</div>
                <div className="text-[10px] text-zinc-500 uppercase">View methodology</div>
              </div>
              <ChevronRight size={14} className="ml-auto text-zinc-700" />
            </div>
          </div>
        </motion.div>

        {/* COLUMN 2: INTERACTIVE MATH & SIMULATION */}
        <motion.div variants={itemVariants} className="lg:col-span-6 space-y-6">
          <div className="space-y-6">
            {/* MAIN CHART */}
            <div className="border border-zinc-800 p-6 bg-black relative">
              <div className="absolute top-4 left-6 z-10">
                <div className="text-[10px] text-zinc-500 uppercase mb-1">mSOL/SOL Spread Deviation</div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 transition-colors duration-500", riskState.regime_flag === 1 ? "bg-emergency-red" : "bg-solana-green")}></div>
                    <span className="text-[10px] uppercase text-zinc-400">Live Spread</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-zinc-700"></div>
                    <span className="text-[10px] uppercase text-zinc-400">Moving Average</span>
                  </div>
                </div>
              </div>

              <div className="h-[300px] w-full mt-8">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorSpread" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={accentColor} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={accentColor} stopOpacity={0}/>
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
                      tickFormatter={(val) => `${(val * 100).toFixed(2)}%`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0D0D0D', border: '1px solid #333', fontSize: '12px', fontFamily: 'monospace' }}
                      itemStyle={{ color: accentColor }}
                    />
                    <ReferenceLine y={-0.005} stroke="#333" strokeDasharray="5 5" />
                    <Area 
                      type="monotone" 
                      dataKey="spread" 
                      stroke={accentColor} 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorSpread)" 
                      animationDuration={1000}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* MATH & DECISION HUB ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              <MathOverlay 
                theta={riskState.theta} 
                sigma={riskState.sigma} 
                zScore={riskState.z_score} 
                regime={riskState.regime_flag} 
              />
              
              <div className={cn(
                "border p-4 transition-all duration-500 flex flex-col justify-between",
                riskState.regime_flag === 1 ? "border-emergency-red bg-emergency-red/10 shadow-brutal-red" : "border-solana-green bg-solana-green/10 shadow-brutal-green"
              )}>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-2">
                    <Lock size={12} /> Suggested LTV
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold mono-data tracking-tighter">
                      {(riskState.suggested_ltv * 100).toFixed(1)}%
                    </span>
                    <span className="text-xs text-zinc-500 font-mono uppercase">Target</span>
                  </div>
                </div>
                <div className="mt-4 space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-500 uppercase">
                    <span>Conservative</span>
                    <span>Aggressive</span>
                  </div>
                  <div className="h-4 w-full bg-black/40 relative overflow-hidden flex">
                    <div className="h-full bg-zinc-800" style={{ width: '60%' }}></div>
                    <motion.div 
                      className={cn("absolute top-0 bottom-0 w-1 z-10", riskState.regime_flag === 1 ? "bg-white shadow-glow-red" : "bg-black")}
                      animate={{ left: `${riskState.suggested_ltv * 100}%` }}
                    />
                    <div className={cn("h-full opacity-50", riskState.regime_flag === 1 ? "bg-emergency-red" : "bg-solana-green")} style={{ width: `${riskState.suggested_ltv * 100}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* COLUMN 3: VERIFIABLE COMPUTATION LOG */}
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <div className="border border-zinc-800 h-full flex flex-col bg-black">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase">
                <Terminal size={12} className={riskState.regime_flag === 1 ? "text-emergency-red" : "text-solana-green"} /> Logic Terminal
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
              </div>
            </div>
            <div className="p-4 flex-1 overflow-y-auto max-h-[600px] scroll-smooth">
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
              <div className={cn("mt-2 animate-pulse text-xs font-mono", riskState.regime_flag === 1 ? "text-emergency-red" : "text-solana-green")}>_</div>
            </div>
            <div className="p-3 border-t border-zinc-800 text-[10px] text-zinc-600 font-mono flex justify-between uppercase">
              <span>System: 0.2.14-stable</span>
              <span className="flex items-center gap-1">
                <AlertTriangle size={10} className={riskState.regime_flag === 1 ? "text-emergency-red" : "text-zinc-700"} />
                Risk Layer v1
              </span>
            </div>
          </div>
        </motion.div>

      </motion.main>

      {/* FOOTER / STATUS BAR */}
      <footer className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-zinc-800 pt-6">
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase">
            <span className="text-solana-green">●</span> RPC Connection: Mainnet-Beta (via Helius)
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase">
            <span className="text-solana-green">●</span> Model Proofs: On-Chain (Verified)
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase">
            <span className="text-zinc-600">○</span> Latency: 142ms
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase justify-end">
            <span className="text-zinc-500">Last Update: 3s ago</span>
          </div>
      </footer>
    </div>
  );
}
