import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import {
  fetchRiskState,
  isStale,
  isCritical,
  DEFAULT_LST_ID,
} from "@pegshield/sdk";
import { getSnapshot } from "@/lib/data";
import { DEVNET_RPC } from "@/lib/constants";
import type { RegimeFlag, ResolvedRiskState } from "@/lib/types";

// Always evaluate at request time — never cache a live oracle read.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RPC_TIMEOUT_MS = 6000;

/** The RPC endpoint can be overridden via env without exposing any secret. */
function rpcUrl(): string {
  return process.env.PEGSHIELD_RPC_URL || DEVNET_RPC;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC timeout after ${ms}ms`)), ms),
    ),
  ]);
}

/** Build the offline-snapshot payload from committed repo artifacts. */
function fallbackPayload(lstId: string, liveError: string | null): ResolvedRiskState {
  const snap = getSnapshot(lstId) ?? getSnapshot(DEFAULT_LST_ID)!;
  return {
    source: "offline-snapshot",
    sourceLabel: "Offline verified snapshot",
    fetchedAt: new Date().toISOString(),
    producedAtIso: snap.updatedAtIso,
    lstId: snap.lstId,
    assetSymbol: snap.assetSymbol,
    assetDisplayName: snap.assetDisplayName,
    baseSymbol: snap.baseSymbol,
    suggestedLtv: snap.suggestedLtv,
    suggestedLtvBps: Math.round(snap.suggestedLtv * 10_000),
    statisticalLtv: snap.statisticalLtv,
    regimeFlag: snap.regimeFlag,
    theta: snap.theta,
    sigma: snap.sigma,
    zScore: snap.zScore,
    pegDeviationPct: snap.pegDeviationPct,
    timestamp: snap.timestamp,
    slot: null,
    dataQualityStatus: snap.dataQualityRisk.status,
    dataQualityHaircut: snap.dataQualityRisk.haircut,
    liquidityStatus: snap.liquidityRisk.status,
    referenceRateSource: snap.referenceRateSource,
    programId: snap.programId,
    riskStatePda: snap.riskStatePda,
    authority: snap.authority,
    lastUpdater: null,
    network: snap.network,
    liveError,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lstId = searchParams.get("lst") || DEFAULT_LST_ID;
  const snap = getSnapshot(lstId);

  // Unknown LST — nothing safe to serve.
  if (!snap) {
    return NextResponse.json(
      { error: `Unknown lstId: ${lstId}` },
      { status: 404 },
    );
  }

  try {
    const connection = new Connection(rpcUrl(), "confirmed");
    const { state, address, programId } = await withTimeout(
      fetchRiskState(connection, { lstId }),
      RPC_TIMEOUT_MS,
    );

    // Evaluate the same freshness/regime flags the SDK guard consumes.
    const stale = isStale(state);
    const critical = isCritical(state);

    const payload: ResolvedRiskState = {
      source: "live-devnet",
      sourceLabel: "Solana devnet (live read)",
      fetchedAt: new Date().toISOString(),
      producedAtIso: state.timestamp
        ? new Date(Number(state.timestamp) * 1000).toISOString()
        : null,
      lstId: state.lstId,
      assetSymbol: snap.assetSymbol,
      assetDisplayName: snap.assetDisplayName,
      baseSymbol: snap.baseSymbol,
      suggestedLtv: state.suggestedLtv,
      suggestedLtvBps: state.suggestedLtvBps,
      // These live only off-chain in the artifact; expose from snapshot for context.
      statisticalLtv: snap.statisticalLtv,
      regimeFlag: state.regimeFlag as RegimeFlag,
      theta: state.theta,
      sigma: state.sigma,
      zScore: state.zScore,
      pegDeviationPct: snap.pegDeviationPct,
      timestamp: Number(state.timestamp),
      slot: Number(state.slot),
      dataQualityStatus: snap.dataQualityRisk.status,
      dataQualityHaircut: snap.dataQualityRisk.haircut,
      liquidityStatus: snap.liquidityRisk.status,
      referenceRateSource: snap.referenceRateSource,
      programId: programId.toBase58(),
      riskStatePda: address.toBase58(),
      authority: state.authority,
      lastUpdater: state.lastUpdater,
      network: "solana-devnet",
      liveError: stale
        ? "on-chain state is stale — consumer guards would fall back"
        : critical
          ? "on-chain regime is CRITICAL — consumer guards would tighten or halt"
          : null,
    };

    return NextResponse.json(payload, {
      headers: { "cache-control": "no-store" },
      status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown RPC error";
    return NextResponse.json(fallbackPayload(lstId, message), {
      headers: { "cache-control": "no-store" },
      status: 200,
    });
  }
}
