import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { cn } from '../types';

export function RegimeBadge({ regime }: { regime: number }) {
  const isCritical = regime === 1;
  return (
    <div className={cn(
      "px-3 py-1 border flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all duration-500",
      isCritical 
        ? "border-emergency-red text-emergency-red bg-emergency-red/10 shadow-glow-red animate-pulse" 
        : "border-solana-green text-solana-green bg-solana-green/10 shadow-glow-green"
    )}>
      {isCritical ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
      {isCritical ? "Critical" : "Normal"}
    </div>
  );
}
