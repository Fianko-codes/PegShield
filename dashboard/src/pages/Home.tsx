import { motion, type Variants } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  ArrowRight, 
  ChevronRight, 
  Zap, 
  AlertTriangle, 
  BarChart3, 
  Cpu, 
  Layers
} from 'lucide-react';
import { cn } from '../types';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

export default function Home() {
  return (
    <div className="py-12 md:py-20">
      {/* HERO SECTION */}
      <motion.section 
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="mb-24 space-y-8 text-center md:mb-40"
      >
        <motion.div variants={itemVariants} className="flex justify-center mb-10">
          <div className="px-3 py-1 border border-solana-green/30 bg-solana-green/5 text-[10px] font-bold uppercase tracking-widest text-solana-green">
            Now Live on Solana Devnet
          </div>
        </motion.div>
        
        <motion.h1 variants={itemVariants} className="text-4xl md:text-8xl font-bold tracking-tighter uppercase leading-[0.9] sm:text-6xl">
          Protect Your <br />
          <span className="text-solana-green">LST Liquidity</span>
        </motion.h1>
        
        <motion.p variants={itemVariants} className="mx-auto max-w-xl text-[11px] uppercase leading-relaxed tracking-[0.18em] text-zinc-500 md:text-sm">
          The verifiable on-chain risk layer for Solana LSTs. 
          Dynamic LTV adjustments driven by statistical mean-reversion modeling.
        </motion.p>
        
        <motion.div variants={itemVariants} className="flex flex-col justify-center gap-4 pt-8 md:flex-row md:gap-6 md:pt-10">
          <Link 
            to="/app" 
            className="px-8 py-4 bg-solana-green text-black font-bold uppercase text-[10px] tracking-[0.2em] shadow-brutal-green transition-all hover:shadow-glow-green md:px-10 md:py-5"
          >
            Launch System App
          </Link>
          <Link 
            to="/sim" 
            className="flex items-center justify-center gap-2 border border-zinc-800 px-8 py-4 font-bold uppercase text-[10px] tracking-[0.2em] transition-all hover:bg-zinc-900 md:px-10 md:py-5"
          >
            Enter Simulation Bridge <ChevronRight size={14} />
          </Link>
        </motion.div>
      </motion.section>

      {/* THE PROBLEM SECTION */}
      <section className="mb-24 grid grid-cols-1 items-center gap-12 lg:mb-40 lg:grid-cols-2 lg:gap-20">
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="space-y-6"
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-emergency-red flex items-center gap-2">
            <AlertTriangle size={12} /> Systemic Risk
          </div>
          <h2 className="text-3xl font-bold uppercase leading-tight tracking-tight md:text-5xl">
            Static Parameters <br />
            Fail During <span className="text-emergency-red">Stress</span>
          </h2>
          <p className="text-[11px] uppercase leading-relaxed tracking-[0.16em] text-zinc-500 md:text-sm">
            During market stress, LST spreads deviate from their mean. Protocols using 
            static LTV react too slowly, leading to bad debt and liquidation gaps.
          </p>
          <div className="space-y-4 pt-4">
            <div className="flex items-start gap-4 border border-zinc-900 bg-zinc-950 p-5 md:p-6">
               <div className="text-emergency-red p-2 bg-emergency-red/10 border border-emergency-red/20">
                 <Zap size={20} />
               </div>
               <div>
                 <div className="text-[10px] font-bold uppercase mb-1">Concentrated Liquidity Risk</div>
                 <div className="text-[10px] text-zinc-600 uppercase tracking-wide">LST/SOL liquidity pools dry up instantly during de-pegs.</div>
               </div>
            </div>
            <div className="flex items-start gap-4 border border-zinc-900 bg-zinc-950 p-5 md:p-6">
               <div className="text-emergency-red p-2 bg-emergency-red/10 border border-emergency-red/20">
                 <BarChart3 size={20} />
               </div>
               <div>
                 <div className="text-[10px] font-bold uppercase mb-1">Reactive Liquidation Gaps</div>
                 <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Arbitrageurs can't exit fast enough when LTV is set too aggressively.</div>
               </div>
            </div>
          </div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, x: 50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="relative flex aspect-square items-center justify-center overflow-hidden border border-zinc-800 bg-black p-5 md:p-8">
             <div className="absolute inset-0 bg-gradient-to-tr from-emergency-red/5 to-transparent"></div>
             <div className="text-center space-y-4 z-10">
                <div className="mb-6 text-[10px] font-mono text-zinc-600 md:mb-8">[ SIMULATION: DE-PEG EVENT NOV-2022 ]</div>
                <div className="flex h-28 w-full items-end gap-1 px-2 md:h-40 md:px-10">
                   {[40, 45, 42, 38, 50, 60, 85, 95, 80, 70, 65, 55].map((h, i) => (
                     <div key={i} className={cn("flex-1", i >= 5 ? "bg-emergency-red" : "bg-zinc-800")} style={{ height: `${h}%` }}></div>
                   ))}
                </div>
                <div className="mono-data text-2xl font-bold uppercase tracking-tighter text-emergency-red md:text-3xl">DE-PEG DETECTED</div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase">Systemic Risk Confidence: 98.4%</div>
             </div>
          </div>
          <div className="absolute -bottom-3 -right-3 flex h-24 w-24 items-center justify-center border border-emergency-red bg-background shadow-brutal-red animate-pulse md:-bottom-6 md:-right-6 md:h-40 md:w-40">
            <span className="text-xl font-bold text-emergency-red md:text-4xl">CRITICAL</span>
          </div>
        </motion.div>
      </section>

      {/* THE SOLUTION SECTION */}
      <section className="mb-24 md:mb-40">
        <div className="text-center mb-20 space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-solana-green">The Infrastructure</div>
          <h2 className="text-3xl font-bold uppercase tracking-tight md:text-5xl">System Components</h2>
          <p className="mx-auto max-w-xl text-[11px] uppercase leading-relaxed tracking-[0.16em] text-zinc-500 md:text-xs">
            PegShield transforms raw market data into decision-ready risk signals verified on-chain.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
           {[
             { title: "Verifiable Computation", icon: Cpu, desc: "Statistical model outputs are verified on-chain to ensure transparency and integrity." },
             { title: "Dynamic LTV Adjustment", icon: Layers, desc: "Recommended collateral factors tighten automatically during non-stationary spread regimes." },
             { title: "Mean-Reversion Health", icon: BarChart3, desc: "Monitors the Ornstein-Uhlenbeck theta parameter to detect when an LST spread is breaking." }
           ].map((item, i) => (
             <motion.div 
               key={i}
               initial={{ opacity: 0, y: 20 }}
               whileInView={{ opacity: 1, y: 0 }}
               viewport={{ once: true }}
               transition={{ delay: i * 0.1 }}
               className="group border border-zinc-900 bg-zinc-950 p-6 transition-all hover:border-solana-green/30 md:p-8"
             >
               <item.icon className="text-solana-green mb-6 group-hover:scale-110 transition-transform" />
               <h3 className="text-sm font-bold uppercase mb-4 tracking-widest">{item.title}</h3>
               <p className="text-[10px] text-zinc-500 uppercase tracking-wider leading-relaxed">{item.desc}</p>
             </motion.div>
           ))}
        </div>
      </section>

      {/* CALL TO ACTION */}
      <section className="relative overflow-hidden bg-solana-green p-8 text-center text-black md:p-24">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 -rotate-45 translate-x-32 -translate-y-32"></div>
        <div className="relative z-10 space-y-8">
          <h2 className="text-3xl font-bold uppercase leading-none tracking-tighter md:text-7xl">
            Scale Your <br />
            Liquidity <span className="opacity-40">Safely</span>
          </h2>
          <p className="mx-auto max-w-lg text-[11px] font-bold uppercase leading-relaxed tracking-[0.18em] md:text-xs">
            Infrastructure built for the next generation of risk-aware DeFi on Solana.
          </p>
          <div className="flex justify-center pt-8">
            <Link 
              to="/app"
              className="flex items-center gap-4 bg-black px-8 py-4 text-[10px] font-bold uppercase tracking-[0.24em] text-white transition-all hover:shadow-brutal-green md:px-12 md:py-6 md:tracking-[0.3em]"
            >
              Open System App <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
