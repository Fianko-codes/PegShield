import { motion, type Variants } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  Zap,
  AlertTriangle,
  BarChart3,
  Cpu,
  Layers,
  ShieldCheck,
  Workflow,
  Waypoints,
  Activity,
} from 'lucide-react';
import { cn } from '../types';
import type { OracleSnapshot, RiskState } from '../types';

interface HomeProps {
  riskState: RiskState;
  oracleSnapshot: OracleSnapshot | null;
}

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

export default function Home({ riskState, oracleSnapshot }: HomeProps) {
  const isCritical = riskState.regime_flag === 1;
  const ltvPct = `${(riskState.suggested_ltv * 100).toFixed(1)}%`;
  const thetaLabel = Number.isFinite(riskState.theta) ? riskState.theta.toFixed(3) : '—';
  const pegDeviationBps =
    oracleSnapshot?.peg_deviation_pct != null
      ? `${(oracleSnapshot.peg_deviation_pct * 10000).toFixed(1)} bps`
      : '—';
  const assetLabel = oracleSnapshot?.asset_symbol ?? 'mSOL';
  const baseLabel = oracleSnapshot?.base_symbol ?? 'SOL';

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
        <motion.div variants={itemVariants} className="mb-10 flex justify-center">
          <div className="space-y-3 text-center">
            <div className="mx-auto inline-flex border border-solana-green/30 bg-solana-green/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-solana-green">
              Now Live on Solana Devnet
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 md:text-xs">
              Risk oracle, not price oracle. For Solana LSTs as collateral.
            </div>
          </div>
        </motion.div>
        
        <motion.h1 variants={itemVariants} className="text-4xl font-bold uppercase leading-[0.9] tracking-tighter sm:text-6xl md:text-8xl">
          Protect Your <br />
          <span className="text-solana-green">LST Liquidity</span>
        </motion.h1>
        
        <motion.p variants={itemVariants} className="mx-auto max-w-xl text-[11px] uppercase leading-relaxed tracking-[0.12em] text-zinc-500 md:text-sm">
          PegShield converts raw LST market behavior into a verifiable on-chain collateral signal.
          Dynamic LTV adjustments are driven by mean-reversion, volatility, and regime-break detection.
        </motion.p>
        
        <motion.div variants={itemVariants} className="flex flex-col justify-center gap-4 pt-8 md:flex-row md:gap-6 md:pt-10">
          <Link
            to="/app"
            className="bg-solana-green px-8 py-4 text-[10px] font-bold uppercase tracking-[0.14em] text-black shadow-brutal-green transition-all hover:shadow-glow-green md:px-10 md:py-5"
          >
            Launch System App
          </Link>
          <Link
            to="/sim"
            className="flex items-center justify-center gap-2 border border-zinc-800 px-8 py-4 text-[10px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-zinc-900 md:px-10 md:py-5"
          >
            Enter Simulation Bridge <ChevronRight size={14} />
          </Link>
        </motion.div>

        <motion.div variants={itemVariants} className="mx-auto mt-12 w-full max-w-4xl md:mt-16">
          <div
            className={cn(
              'border bg-black/60 backdrop-blur-sm transition-colors',
              isCritical ? 'border-emergency-red/60' : 'border-zinc-800',
            )}
          >
            <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-2">
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                <Activity
                  size={10}
                  className={cn(isCritical ? 'text-emergency-red' : 'text-solana-green', 'animate-pulse')}
                />
                Live oracle pulse
              </div>
              <div className="text-[9px] uppercase tracking-[0.12em] text-zinc-600">
                {assetLabel} / {baseLabel} // devnet
              </div>
            </div>
            <div className="grid grid-cols-2 divide-zinc-900 md:grid-cols-4 md:divide-x">
              <div className="border-b border-zinc-900 p-4 md:border-b-0">
                <div className="text-[9px] uppercase tracking-[0.1em] text-zinc-600">Regime</div>
                <div
                  className={cn(
                    'mt-2 text-sm font-bold uppercase tracking-tight md:text-base',
                    isCritical ? 'text-emergency-red' : 'text-solana-green',
                  )}
                >
                  {isCritical ? 'Critical' : 'Normal'}
                </div>
              </div>
              <div className="border-b border-zinc-900 p-4 md:border-b-0">
                <div className="text-[9px] uppercase tracking-[0.1em] text-zinc-600">Suggested LTV</div>
                <div className="mt-2 font-mono text-sm font-bold text-white md:text-base">{ltvPct}</div>
              </div>
              <div className="p-4">
                <div className="text-[9px] uppercase tracking-[0.1em] text-zinc-600">Peg deviation</div>
                <div className="mt-2 font-mono text-sm font-bold text-zinc-300 md:text-base">
                  {pegDeviationBps}
                </div>
              </div>
              <div className="p-4">
                <div className="text-[9px] uppercase tracking-[0.1em] text-zinc-600">θ mean-reversion</div>
                <div className="mt-2 font-mono text-sm font-bold text-zinc-300 md:text-base">
                  {thetaLabel}
                </div>
              </div>
            </div>
          </div>
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
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emergency-red">
            <AlertTriangle size={12} /> Systemic Risk
          </div>
          <h2 className="text-3xl font-bold uppercase leading-tight tracking-tight md:text-5xl">
            Static Parameters <br />
            Fail During <span className="text-emergency-red">Stress</span>
          </h2>
          <p className="text-[11px] uppercase leading-relaxed tracking-[0.12em] text-zinc-500 md:text-sm">
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
                 <div className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-600">LST/SOL liquidity pools dry up instantly during de-pegs.</div>
               </div>
            </div>
            <div className="flex items-start gap-4 border border-zinc-900 bg-zinc-950 p-5 md:p-6">
               <div className="text-emergency-red p-2 bg-emergency-red/10 border border-emergency-red/20">
                 <BarChart3 size={20} />
               </div>
               <div>
                 <div className="text-[10px] font-bold uppercase mb-1">Reactive Liquidation Gaps</div>
                 <div className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-600">Arbitrageurs can't exit fast enough when LTV is set too aggressively.</div>
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
                <div className="mb-6 text-[10px] font-mono text-zinc-600 md:mb-8">[ REPLAY: stETH / ETH DEPEG // JUN-2022 ]</div>
                <div className="flex h-28 w-full items-end gap-1 px-2 md:h-40 md:px-10">
                   {[40, 45, 42, 38, 50, 60, 85, 95, 80, 70, 65, 55].map((h, i) => (
                     <div key={i} className={cn("flex-1", i >= 5 ? "bg-emergency-red" : "bg-zinc-800")} style={{ height: `${h}%` }}></div>
                   ))}
                </div>
                <div className="mono-data text-2xl font-bold uppercase tracking-tighter text-emergency-red md:text-3xl">DE-PEG DETECTED</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">Real historical fixture replayed in /sim</div>
             </div>
          </div>
          <div className="absolute -bottom-3 -right-3 flex h-24 w-24 items-center justify-center border border-emergency-red bg-background shadow-brutal-red animate-pulse md:-bottom-6 md:-right-6 md:h-40 md:w-40">
            <span className="text-xl font-bold text-emergency-red md:text-4xl">CRITICAL</span>
          </div>
        </motion.div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mb-24 md:mb-40">
        <div className="mb-16 space-y-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-solana-green">How It Works</div>
          <h2 className="text-3xl font-bold uppercase tracking-tight md:text-5xl">From Price Feed To Lending Decision</h2>
          <p className="mx-auto max-w-2xl text-[11px] uppercase leading-relaxed tracking-[0.12em] text-zinc-500 md:text-xs">
            PegShield sits between raw market prices and protocol risk management. It converts LST market behavior
            into a live on-chain signal that lenders can actually use.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[
            {
              title: 'Pyth Market Data',
              icon: Zap,
              desc: 'Live LST and SOL prices arrive from Hermes with recent spread history. Current repo support covers mSOL and jitoSOL.',
            },
            {
              title: 'Statistical Engine',
              icon: Cpu,
              desc: 'OU calibration, volatility checks, and regime detection produce the risk signal.',
            },
            {
              title: 'On-Chain Oracle',
              icon: Workflow,
              desc: 'The updater publishes suggested LTV and regime state to a Solana PDA.',
            },
            {
              title: 'Protocol Action',
              icon: ShieldCheck,
              desc: 'Lenders can tighten borrow limits before LST collateral stress turns into bad debt.',
            },
          ].map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
              className="border border-zinc-900 bg-zinc-950 p-6"
            >
              <item.icon className="mb-5 text-solana-green" />
              <div className="mb-3 text-sm font-bold uppercase tracking-[0.08em]">{item.title}</div>
              <p className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* THE SOLUTION SECTION */}
      <section className="mb-24 md:mb-40">
        <div className="text-center mb-20 space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-solana-green">The Infrastructure</div>
          <h2 className="text-3xl font-bold uppercase tracking-tight md:text-5xl">System Components</h2>
          <p className="mx-auto max-w-xl text-[11px] uppercase leading-relaxed tracking-[0.12em] text-zinc-500 md:text-xs">
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
               <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.08em]">{item.title}</h3>
               <p className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">{item.desc}</p>
             </motion.div>
           ))}
        </div>
      </section>

      {/* FOR PROTOCOLS */}
      <section className="mb-24 md:mb-40">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
          <div className="border border-zinc-900 bg-zinc-950 p-8 md:p-10">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em] text-solana-green">For Protocols</div>
            <h2 className="mb-6 text-3xl font-bold uppercase tracking-tight md:text-5xl">
              One Oracle Read, <br />
              One Safer Borrow Limit
            </h2>
            <p className="mb-8 max-w-2xl text-[11px] uppercase leading-relaxed tracking-[0.12em] text-zinc-500 md:text-xs">
              A lender does not need to trust a dashboard. It only needs one on-chain state account with the latest
              suggested LTV, regime flag, and calibration outputs. PegShield is designed as middleware that protocols
              can read before accepting LST collateral risk.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="border border-zinc-800 p-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">Inputs</div>
                <div className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
                  LST price, SOL price, spread history, OU parameters, regime state
                </div>
              </div>
              <div className="border border-zinc-800 p-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">Output</div>
                <div className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
                  Suggested LTV published on Solana devnet for protocol-side collateral policy
                </div>
              </div>
              <div className="border border-zinc-800 p-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">Benefit</div>
                <div className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500">
                  Tighter borrow limits during stress instead of waiting for liquidation gaps
                </div>
              </div>
            </div>
          </div>

          <div className="border border-solana-green/30 bg-solana-green/5 p-8 md:p-10">
            <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-solana-green">
              <Waypoints size={12} /> Live Resources
            </div>
            <div className="space-y-4">
              {[
                {
                  label: 'System App',
                  href: '/app',
                  external: false,
                  desc: 'Live dashboard reading current oracle and market state.',
                },
                {
                  label: 'Oracle API',
                  href: 'https://pegshield.anubhavprasai.com.np/api/oracle-state',
                  external: true,
                  desc: 'Read the current risk PDA payload served by the hosted app.',
                },
                {
                  label: 'Market API',
                  href: 'https://pegshield.anubhavprasai.com.np/api/market-state',
                  external: true,
                  desc: 'Read live Hermes-backed market state used by the dashboard.',
                },
                {
                  label: 'GitHub Repo',
                  href: 'https://github.com/Fianko-codes/PegShield',
                  external: true,
                  desc: 'Inspect the code, workflows, and on-chain integration path.',
                },
              ].map((item) => (
                item.external ? (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block border border-solana-green/20 p-4 transition-colors hover:border-solana-green"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-solana-green">{item.label}</span>
                      <ArrowRight size={14} className="text-solana-green" />
                    </div>
                    <div className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-300">{item.desc}</div>
                  </a>
                ) : (
                  <Link
                    key={item.label}
                    to={item.href}
                    className="block border border-solana-green/20 p-4 transition-colors hover:border-solana-green"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-solana-green">{item.label}</span>
                      <ArrowRight size={14} className="text-solana-green" />
                    </div>
                    <div className="text-[10px] uppercase leading-relaxed tracking-[0.08em] text-zinc-300">{item.desc}</div>
                  </Link>
                )
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SCENARIO LAB TEASER */}
      <section className="mb-24 md:mb-40">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-solana-green">Scenario Lab</div>
            <h2 className="text-3xl font-bold uppercase tracking-tight md:text-5xl">
              Six Collapse Shapes, <br />
              One Oracle Under Pressure
            </h2>
            <p className="max-w-2xl text-[11px] uppercase leading-relaxed tracking-[0.12em] text-zinc-500 md:text-xs">
              One replay is not enough. The lab runs PegShield against a real historical depeg plus five
              synthetic black-swan shapes so you can see how it behaves across regimes — including the
              noise cases, where a good oracle should <span className="text-solana-green">not</span> panic.
            </p>
          </div>
          <Link
            to="/sim"
            className="flex shrink-0 items-center gap-2 border border-solana-green px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-solana-green transition-all hover:bg-solana-green hover:text-black"
          >
            Open Scenario Lab <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-6">
          {[
            { label: 'stETH Jun-2022', sub: 'Real contagion' },
            { label: 'Liquidity Vacuum', sub: 'Fast gap down' },
            { label: 'Bank Run', sub: 'Two-leg selloff' },
            { label: 'Slow Grind', sub: 'Creeping drift' },
            { label: 'False Wick', sub: 'Noise resilience' },
            { label: 'Flash Crash', sub: 'Fast snapback' },
          ].map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className="border border-zinc-900 bg-zinc-950 p-4"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-white">{item.label}</div>
              <div className="mt-2 text-[9px] uppercase tracking-[0.08em] text-zinc-500">{item.sub}</div>
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
          <p className="mx-auto max-w-lg text-[11px] font-bold uppercase leading-relaxed tracking-[0.12em] md:text-xs">
            Infrastructure built for the next generation of risk-aware DeFi on Solana.
          </p>
          <div className="flex justify-center pt-8">
            <Link 
              to="/app"
              className="flex items-center gap-4 bg-black px-8 py-4 text-[10px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:shadow-brutal-green md:px-12 md:py-6 md:tracking-[0.22em]"
            >
              Open System App <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
