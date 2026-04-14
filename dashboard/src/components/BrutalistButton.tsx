import { type ReactNode } from 'react';
import { cn } from '../types';

interface BrutalistButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'green' | 'red' | 'zinc';
  className?: string;
}

export function BrutalistButton({ 
  children, 
  onClick, 
  variant = 'green', 
  className 
}: BrutalistButtonProps) {
  const variantClasses = {
    green: "border-solana-green text-solana-green shadow-brutal-green hover:bg-solana-green hover:text-black",
    red: "border-emergency-red text-emergency-red shadow-brutal-red hover:bg-emergency-red hover:text-white",
    zinc: "border-zinc-800 text-zinc-400 hover:border-white hover:text-white"
  };

  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-2 border text-[10px] font-bold uppercase tracking-widest transition-all",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </button>
  );
}
