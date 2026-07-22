import type { RiskStatus } from "./types";

export const PROGRAM_ID = "DMR3rXBh8RGrKyx1mxqFVTMbyfoiuu9iYHr6s6CW23ea";
export const MSOL_PDA = "7dtHBg6SyTykm1sDDvFPxoj7UJ12jqbFKSC5S8gpenGo";
export const UPDATER_AUTHORITY = "4kEmLqMqb3PGsmBC8brARQ5sKzUv37PjdSereu1yoNyc";
export const DEFAULT_LST_ID = "mSOL-v2";
export const MAX_STALENESS_SECS = 600;
export const DEFAULT_FALLBACK_LTV = 0.4;
export const DEVNET_RPC = "https://api.devnet.solana.com";
export const REPO_URL = "https://github.com/Fianko-codes/PegShield";

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}
export function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

/** Regime + freshness → a single status the UI renders. */
export function deriveStatus(
  regimeFlag: number,
  timestamp: number,
  nowSec: number,
  maxAgeSec: number = MAX_STALENESS_SECS,
): RiskStatus {
  if (!timestamp) return "stale";
  if (nowSec - timestamp > maxAgeSec) return "stale";
  if (regimeFlag === 1) return "critical";
  return "healthy";
}

export const STATUS_META: Record<
  RiskStatus,
  { label: string; pillClass: string; tone: string }
> = {
  healthy: { label: "Normal", pillClass: "is-healthy", tone: "var(--emerald)" },
  watch: { label: "Watch", pillClass: "is-watch", tone: "var(--amber)" },
  critical: { label: "Critical", pillClass: "is-critical", tone: "var(--coral)" },
  stale: { label: "Stale", pillClass: "is-watch", tone: "var(--amber)" },
  unknown: { label: "Unknown", pillClass: "is-neutral", tone: "var(--text-2)" },
};
