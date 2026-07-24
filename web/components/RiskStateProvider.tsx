"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ResolvedRiskState } from "@/lib/types";

type LoadState = "loading" | "ready" | "error";

interface RiskStateContextValue {
  data: ResolvedRiskState | null;
  loadState: LoadState;
  /** True while a (re)fetch is in flight, even if we already have data. */
  refreshing: boolean;
  reload: () => void;
}

const RiskStateContext = createContext<RiskStateContextValue | null>(null);

/**
 * How often to re-read the live RiskState. The on-chain account is rate-limited
 * to one update every 30s, so polling faster buys nothing. A quiet re-fetch
 * (data is kept, only `refreshing` flips) means no loading skeleton flash.
 */
const POLL_INTERVAL_MS = 30_000;

export function RiskStateProvider({
  lstId,
  children,
}: {
  lstId: string;
  children: ReactNode;
}) {
  const [data, setData] = useState<ResolvedRiskState | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setRefreshing(true);
    if (!data) setLoadState("loading");

    fetch(`/api/riskstate?lst=${encodeURIComponent(lstId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ResolvedRiskState;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoadState("ready");
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        setLoadState("error");
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lstId, nonce]);

  // Auto-refresh: re-read the live account on an interval so the card reflects
  // new on-chain publishes without a manual click. Polling pauses while the tab
  // is hidden (no point spending devnet RPC on an unseen page) and fires once
  // immediately on re-focus so a returning viewer sees a current value.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let timer: number | undefined;
    const start = () => {
      if (timer === undefined) {
        timer = window.setInterval(reload, POLL_INTERVAL_MS);
      }
    };
    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        reload();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

  return (
    <RiskStateContext.Provider value={{ data, loadState, refreshing, reload }}>
      {children}
    </RiskStateContext.Provider>
  );
}

export function useRiskState(): RiskStateContextValue {
  const ctx = useContext(RiskStateContext);
  if (!ctx) {
    throw new Error("useRiskState must be used within RiskStateProvider");
  }
  return ctx;
}
