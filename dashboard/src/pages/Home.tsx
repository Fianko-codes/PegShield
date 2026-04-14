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
    <div className="py-20">
      {/* HERO SECTION */}
      <motion.section 
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="text-center space-y-8 mb-40"
      >
        <motion.div variants={itemVariants} className="flex justify-center mb-10">
          <div className="px-3 py-1 border border-solana-green/30 bg-solana-green/5 text-[10px] font-bold uppercase tracking-widest text-solana-green">
            Now Live on Solana Devnet
          </div>
        </motion.div>
        
        <motion.h1 variants={itemVariants} className="text-6xl md:text-8xl font-bold tracking-tighter uppercase leading-[0.9]">
          Protect Your <br />
          <span className="text-solana-green">LST Liquidity</span>
        </motion.h1>
        
        <motion.p variants={itemVariants} className="max-w-xl mx-auto text-zinc-500 text-xs md:text-sm uppercase tracking-widest leading-relaxed">
          The verifiable on-chain risk layer for Solana LSTs. 
          Dynamic LTV adjustments driven by statistical mean-reversion modeling.
        </motion.p>
        
        <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-center gap-6 pt-10">
          <Link 
            to="/app" 
            className="px-10 py-5 bg-solana-green text-black font-bold uppercase text-[10px] tracking-[0.2em] shadow-brutal-green hover:shadow-glow-green transition-all"
          >
            Launch System App
          </Link>
          <Link 
            to="/sim" 
            className="px-10 py-5 border border-zinc-800 font-bold uppercase text-[10px] tracking-[0.2em] hover:bg-zinc-900 transition-all flex items-center justify-center gap-2"
          >
            Enter Simulation Bridge <ChevronRight size={14} />
          </Link>
        </motion.div>
      </motion.section>

      {/* THE PROBLEM SECTION */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center mb-40">
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="space-y-6"
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-emergency-red flex items-center gap-2">
            <AlertTriangle size={12} /> Systemic Risk
          </div>
          <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight leading-tight">
            Static Parameters <br />
            Fail During <span className="text-emergency-red">Stress</span>
          </h2>
          <p className="text-zinc-500 text-xs md:text-sm uppercase tracking-widest leading-relaxed">
            During market stress, LST spreads deviate from their mean. Protocols using 
            static LTV react too slowly, leading to bad debt and liquidation gaps.
          </p>
          <div className="space-y-4 pt-4">
            <div className="p-6 border border-zinc-900 bg-zinc-950 flex items-start gap-4">
               <div className="text-emergency-red p-2 bg-emergency-red/10 border border-emergency-red/20">
                 <Zap size={20} />
               </div>
               <div>
                 <div className="text-[10px] font-bold uppercase mb-1">Concentrated Liquidity Risk</div>
                 <div className="text-[10px] text-zinc-600 uppercase tracking-wide">LST/SOL liquidity pools dry up instantly during de-pegs.</div>
               </div>
            </div>
            <div className="p-6 border border-zinc-900 bg-zinc-950 flex items-start gap-4">
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
          <div className="aspect-square border border-zinc-800 bg-black p-8 relative overflow-hidden flex items-center justify-center">
             <div className="absolute inset-0 bg-gradient-to-tr from-emergency-red/5 to-transparent"></div>
             <div className="text-center space-y-4 z-10">
                <div className="text-[10px] font-mono text-zinc-600 mb-8">[ SIMULATION: DE-PEG EVENT NOV-2022 ]</div>
                <div className="h-40 w-full flex items-end gap-1 px-10">
                   {[40, 45, 42, 38, 50, 60, 85, 95, 80, 70, 65, 55].map((h, i) => (
                     <div key={i} className={cn("flex-1", i >= 5 ? "bg-emergency-red" : "bg-zinc-800")} style={{ height: `${h}%` }}></div>
                   ))}
                </div>
                <div className="text-3xl font-bold mono-data text-emergency-red uppercase tracking-tighter">DE-PEG DETECTED</div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase">Systemic Risk Confidence: 98.4%</div>
             </div>
          </div>
          <div className="absolute -bottom-6 -right-6 w-40 h-40 border border-emergency-red shadow-brutal-red bg-background flex items-center justify-center animate-pulse">
            <span className="text-4xl font-bold text-emergency-red">CRITICAL</span>
          </div>
        </motion.div>
      </section>

      {/* THE SOLUTION SECTION */}
      <section className="mb-40">
        <div className="text-center mb-20 space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-solana-green">The Infrastructure</div>
          <h2 className="text-5xl font-bold uppercase tracking-tight">System Components</h2>
          <p className="max-w-xl mx-auto text-zinc-500 text-xs uppercase tracking-widest leading-relaxed">
            PegShield transforms raw market data into decision-ready risk signals verified on-chain.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
               className="p-8 border border-zinc-900 bg-zinc-950 hover:border-solana-green/30 transition-all group"
             >
               <item.icon className="text-solana-green mb-6 group-hover:scale-110 transition-transform" />
               <h3 className="text-sm font-bold uppercase mb-4 tracking-widest">{item.title}</h3>
               <p className="text-[10px] text-zinc-500 uppercase tracking-wider leading-relaxed">{item.desc}</p>
             </motion.div>
           ))}
        </div>
      </section>

      {/* CALL TO ACTION */}
      <section className="bg-solana-green p-12 md:p-24 text-black text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 -rotate-45 translate-x-32 -translate-y-32"></div>
        <div className="relative z-10 space-y-8">
          <h2 className="text-5xl md:text-7xl font-bold uppercase tracking-tighter leading-none">
            Scale Your <br />
            Liquidity <span className="opacity-40">Safely</span>
          </h2>
          <p className="max-w-lg mx-auto text-xs font-bold uppercase tracking-[0.2em] leading-relaxed">
            Infrastructure built for the next generation of risk-aware DeFi on Solana.
          </p>
          <div className="flex justify-center pt-8">
            <Link 
              to="/app"
              className="px-12 py-6 bg-black text-white font-bold uppercase text-[10px] tracking-[0.3em] hover:shadow-brutal-green transition-all flex items-center gap-4"
            >
              Open System App <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
