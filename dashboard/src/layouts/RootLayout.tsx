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
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <Outlet />
      </main>
      
      {/* GLOBAL FOOTER */}
      <footer className="border-t border-zinc-800 bg-black mt-20 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className={cn(
                  "w-6 h-6 border flex items-center justify-center",
                  regime === 1 ? "border-emergency-red shadow-glow-red" : "border-solana-green shadow-glow-green"
                )}>
                   <div className={cn("w-2 h-2", regime === 1 ? "bg-emergency-red" : "bg-solana-green")}></div>
                </div>
                <span className="text-lg font-bold uppercase tracking-tighter">PegShield</span>
              </div>
              <p className="text-zinc-500 text-xs max-w-md leading-relaxed uppercase tracking-wide">
                Solana-native risk infrastructure for liquid staking tokens. 
                Our oracle provides verifiable, low-latency risk signals to lending protocols 
                to mitigate bad debt during market stress events.
              </p>
            </div>
            
            <div>
              <h4 className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest mb-6">Navigation</h4>
              <ul className="space-y-4 text-[10px] uppercase tracking-widest font-bold">
                <li><Link to="/" className="text-zinc-500 hover:text-white transition-colors">Narrative</Link></li>
                <li><Link to="/app" className="text-zinc-500 hover:text-white transition-colors">System App</Link></li>
                <li><Link to="/sim" className="text-zinc-500 hover:text-white transition-colors">Shock Simulation</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest mb-6">Resources</h4>
              <ul className="space-y-4 text-[10px] uppercase tracking-widest font-bold">
                <li><a href="https://peg-shield.vercel.app/api/oracle-state" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">Live Oracle API</a></li>
                <li><a href="https://github.com/Fianko-codes/PegShield" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">Github</a></li>
                <li><a href="https://github.com/Fianko-codes/PegShield/actions/workflows/oracle-updater.yml" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">Oracle Updater</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-20 pt-8 border-t border-zinc-900 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-[10px] text-zinc-700 uppercase tracking-widest">
              © 2026 PegShield Labs // Built for Solana
            </div>
            <div className="flex gap-8 text-[10px] text-zinc-700 uppercase tracking-widest">
              <span>Devnet-v1.0.4</span>
              <span>All Systems Operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
