import { Link, Outlet } from 'react-router-dom';
import Nav from '../components/Nav';
import { cn } from '../types';
import type { RiskState } from '../types';

export default function RootLayout({ riskState }: { riskState: RiskState }) {
  const regime = riskState.regime_flag;
  
  return (
    <div className={cn(
      "min-h-screen bg-background text-white font-sans selection:bg-solana-green selection:text-black transition-colors duration-1000 flex flex-col",
      regime === 1 && "regime-critical selection:bg-emergency-red"
    )}>
      <Nav riskState={riskState} />
      <main className="flex-grow w-full max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      
      {/* GLOBAL FOOTER */}
      <footer className="mt-20 border-t border-zinc-800 bg-black py-12">
        <div className="max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[1900px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-12">
            <div className="col-span-1 md:col-span-2">
              <div className="mb-6 flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 border flex items-center justify-center",
                  regime === 1 ? "border-emergency-red shadow-glow-red" : "border-solana-green shadow-glow-green"
                )}>
                   <div className={cn("w-2 h-2", regime === 1 ? "bg-emergency-red" : "bg-solana-green")}></div>
                </div>
                <span className="text-lg font-bold uppercase tracking-tighter">PegShield</span>
              </div>
              <p className="max-w-md text-[11px] uppercase leading-relaxed tracking-[0.08em] text-zinc-500 md:text-xs">
                Solana-native risk infrastructure for liquid staking tokens. 
                Our oracle provides verifiable, low-latency risk signals to lending protocols 
                to mitigate bad debt during market stress events.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-[0.08em]">
                <a
                  href="https://github.com/Fianko-codes"
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-300 transition-colors hover:text-white"
                >
                  Creator Github
                </a>
                <a
                  href="https://github.com/Fianko-codes/PegShield"
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-500 transition-colors hover:text-white"
                >
                  Project Repo
                </a>
              </div>
            </div>
            
            <div>
              <h4 className="mb-6 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-300">Navigation</h4>
              <ul className="space-y-4 text-[10px] font-bold uppercase tracking-[0.1em]">
                <li><Link to="/" className="text-zinc-500 hover:text-white transition-colors">Narrative</Link></li>
                <li><Link to="/app" className="text-zinc-500 hover:text-white transition-colors">System App</Link></li>
                <li><Link to="/sim" className="text-zinc-500 hover:text-white transition-colors">Shock Simulation</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="mb-6 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-300">Resources</h4>
              <ul className="space-y-4 text-[10px] font-bold uppercase tracking-[0.1em]">
                <li><a href="https://pegshield.anubhavprasai.com.np/api/oracle-state" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">Live Oracle API</a></li>
                <li><a href="https://github.com/Fianko-codes/PegShield" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">Github</a></li>
                <li><a href="https://github.com/Fianko-codes/PegShield/actions/workflows/oracle-updater.yml" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">Oracle Updater</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-zinc-900 pt-8 md:mt-20 md:flex-row md:items-center">
            <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-700">
              © 2026 PegShield Labs // Built for Solana
            </div>
            <div className="flex flex-wrap gap-4 text-[10px] uppercase tracking-[0.08em] text-zinc-700 md:gap-8">
              <span>Devnet-v1.0.4</span>
              <span>All Systems Operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
