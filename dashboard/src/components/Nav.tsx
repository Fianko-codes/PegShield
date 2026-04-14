import { Link, useLocation } from 'react-router-dom';
import { ShieldCheck, Menu, X, Cpu } from 'lucide-react';
import { cn } from '../types';
import type { RiskState } from '../types';
import { RegimeBadge } from './RegimeBadge';
import { useState } from 'react';

export default function Nav({ riskState }: { riskState: RiskState }) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const regime = riskState.regime_flag;

  const navLinks = [
    { name: 'Narrative', path: '/' },
    { name: 'System App', path: '/app' },
    { name: 'Shock Simulation', path: '/sim' },
  ];

  return (
    <nav className={cn(
      "border-b border-zinc-800 bg-background sticky top-0 z-50 transition-colors duration-500",
      regime === 1 && "border-emergency-red/50"
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4 md:gap-8">
            <Link to="/" className="flex items-center gap-2 group">
              <div className={cn(
                "w-8 h-8 flex items-center justify-center border transition-all duration-500",
                regime === 1 ? "border-emergency-red shadow-glow-red" : "border-solana-green shadow-glow-green"
              )}>
                <ShieldCheck size={18} className={regime === 1 ? "text-emergency-red" : "text-solana-green"} />
              </div>
              <span className="text-lg font-bold tracking-tighter uppercase transition-all group-hover:tracking-normal md:text-xl">
                PegShield
              </span>
            </Link>

            {/* LIVE SYSTEM INDICATORS - Product maturity signal */}
            <div className="hidden min-w-0 lg:flex items-center gap-4 xl:gap-6 pl-4 xl:pl-6 border-l border-zinc-900">
               <RegimeBadge regime={regime} />
               <div className="flex flex-col">
                  <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-zinc-600">Live θ</span>
                  <span className={cn("text-[10px] mono-data font-bold", regime === 1 ? "text-emergency-red" : "text-zinc-300")}>
                    {riskState.theta.toFixed(4)}
                  </span>
               </div>
               <div className="flex flex-col">
                  <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-zinc-600">Live σ</span>
                  <span className={cn("text-[10px] mono-data font-bold", regime === 1 ? "text-emergency-red" : "text-zinc-300")}>
                    {riskState.sigma.toFixed(4)}
                  </span>
               </div>
               <div className="flex items-center gap-1">
                  <Cpu size={10} className="text-zinc-700 animate-pulse" />
                  <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-zinc-700">Oracle Node: mSOL-01</span>
               </div>
            </div>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-4 lg:gap-6">
            <a
              href="https://github.com/Fianko-codes"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400 transition-colors hover:text-white"
            >
              Built by Fianko-codes
            </a>
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.12em] transition-colors",
                  location.pathname === link.path 
                    ? (regime === 1 ? "text-emergency-red" : "text-solana-green") 
                    : "text-zinc-500 hover:text-white"
                )}
              >
                {link.name}
              </Link>
            ))}
            <Link 
              to="/app"
              className={cn(
                "border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition-all",
                regime === 1 
                  ? "border-emergency-red text-emergency-red shadow-brutal-red hover:bg-emergency-red hover:text-white" 
                  : "border-solana-green text-solana-green shadow-brutal-green hover:bg-solana-green hover:text-black"
              )}
            >
              Open System App
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-zinc-400 hover:text-white"
              aria-label="Toggle navigation"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      {isOpen && (
        <div className="space-y-4 border-t border-zinc-800 bg-black/95 px-4 pb-6 pt-2 backdrop-blur-md md:hidden">
          <a
            href="https://github.com/Fianko-codes"
            target="_blank"
            rel="noreferrer"
            className="block text-sm font-bold uppercase tracking-[0.1em] text-zinc-300"
          >
            Built by Fianko-codes
          </a>
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setIsOpen(false)}
              className={cn(
                "block text-sm font-bold uppercase tracking-[0.12em]",
                location.pathname === link.path 
                  ? (regime === 1 ? "text-emergency-red" : "text-solana-green") 
                  : "text-zinc-500"
              )}
            >
              {link.name}
            </Link>
          ))}
          <Link 
            to="/app"
            onClick={() => setIsOpen(false)}
            className={cn(
              "block w-full border px-4 py-3 text-center text-[10px] font-bold uppercase tracking-[0.12em]",
              regime === 1 
                ? "border-emergency-red text-emergency-red shadow-brutal-red" 
                : "border-solana-green text-solana-green shadow-brutal-green"
            )}
          >
            Open System App
          </Link>
        </div>
      )}
    </nav>
  );
}
