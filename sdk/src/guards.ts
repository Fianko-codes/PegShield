import { MAX_STALENESS_SECS } from "./constants";
import type { RiskState } from "./types";

/**
 * `true` if the PDA's last-update timestamp is older than `maxAgeSec`.
 *
 * Consumers should treat a stale state as "do not use" and fall back to a
 * conservative static LTV, not a higher one.
 *
 * @param state       Decoded `RiskState`.
 * @param nowSec      Override current time (defaults to `Date.now()`).
 * @param maxAgeSec   Max tolerated staleness in seconds (default: 600).
 */
export function isStale(
  state: Pick<RiskState, "timestamp">,
  nowSec: number = Math.floor(Date.now() / 1000),
  maxAgeSec: number = MAX_STALENESS_SECS,
): boolean {
  const ts = Number(state.timestamp);
  if (!ts) return true; // zero => never updated
  return nowSec - ts > maxAgeSec;
}

/** `true` when the regime detector has flagged non-stationarity + extreme z-score. */
export function isCritical(state: Pick<RiskState, "regimeFlag">): boolean {
  return state.regimeFlag === 1;
}

/**
 * Opinionated consumer helper: returns the LTV a lending protocol should enforce.
 *
 * - Returns `fallbackLtv` (default 0.40) when the state is stale or CRITICAL.
 * - Otherwise returns the oracle's `suggestedLtv` clamped to `[0, maxLtv]`.
 *
 * This is a reference policy; protocols are free to implement stricter logic.
 */
export function safeLtv(
  state: RiskState,
  options: {
    nowSec?: number;
    maxAgeSec?: number;
    fallbackLtv?: number;
    maxLtv?: number;
  } = {},
): number {
  const fallback = options.fallbackLtv ?? 0.4;
  const maxLtv = options.maxLtv ?? 0.9;

  if (isStale(state, options.nowSec, options.maxAgeSec)) return fallback;
  if (isCritical(state)) return fallback;
  return Math.min(Math.max(state.suggestedLtv, 0), maxLtv);
}
