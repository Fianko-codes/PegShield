const fs = require('fs');
const path = require('path');

function loadSdk() {
  try {
    return require('@pegshield/sdk');
  } catch {
    return require('../../sdk/dist');
  }
}

function loadWeb3() {
  try {
    return require('@solana/web3.js');
  } catch {
    return require('../../updater/node_modules/@solana/web3.js');
  }
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function extractArgs(argv: string[]) {
  const positional: string[] = [];
  let snapshotPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--snapshot') {
      snapshotPath = argv[index + 1];
      index += 1;
      continue;
    }
    positional.push(current);
  }

  return {
    collateralUnits: parseNumber(positional[0], 100),
    unitPriceUsd: parseNumber(positional[1], 1814.63),
    symbol: positional[2] ?? 'stETH',
    snapshotPath,
  };
}

function buildSnapshotState(snapshot: any) {
  return {
    lstId: snapshot.lst_id ?? 'mSOL-v2',
    theta: Number(snapshot.theta ?? 0),
    sigma: Number(snapshot.sigma ?? 0),
    zScore: Number(snapshot.z_score ?? 0),
    suggestedLtv: Number(snapshot.suggested_ltv ?? 0),
    thetaScaled: BigInt(Math.round(Number(snapshot.theta ?? 0) * 1_000_000)),
    sigmaScaled: BigInt(Math.round(Number(snapshot.sigma ?? 0) * 1_000_000)),
    zScoreScaled: BigInt(Math.round(Number(snapshot.z_score ?? 0) * 1_000_000)),
    suggestedLtvBps: Math.round(Number(snapshot.suggested_ltv ?? 0) * 10_000),
    regimeFlag: Number(snapshot.regime_flag ?? 0),
    slot: 0n,
    timestamp: BigInt(snapshot.timestamp ?? 0),
    authority: snapshot.authority ?? 'snapshot-authority',
    lastUpdater: snapshot.authority ?? 'snapshot-authority',
  };
}

async function loadRiskState(snapshotPath?: string) {
  const sdk = loadSdk();
  if (snapshotPath) {
    const absolutePath = path.resolve(process.cwd(), snapshotPath);
    const snapshot = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
    return {
      source: `snapshot:${absolutePath}`,
      address: snapshot.risk_state_pda ?? 'snapshot-pda',
      state: buildSnapshotState(snapshot),
      sdk,
    };
  }

  const { Connection } = loadWeb3();
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const { state, address } = await sdk.fetchRiskState(connection);
  return {
    source: 'solana-devnet',
    address: address.toBase58(),
    state,
    sdk,
  };
}

async function main() {
  const { collateralUnits, unitPriceUsd, symbol, snapshotPath } = extractArgs(process.argv.slice(2));
  const collateralValueUsd = collateralUnits * unitPriceUsd;
  const { source, address, state, sdk } = await loadRiskState(snapshotPath);

  const fixedLtv = 0.8;
  const enforcedLtv = sdk.safeLtv(state, { fallbackLtv: 0.4, maxLtv: 0.8 });
  const stateIsStale = sdk.isStale(state);
  const stateIsCritical = sdk.isCritical(state);

  const staticBorrow = collateralValueUsd * fixedLtv;
  const pegShieldBorrow = collateralValueUsd * enforcedLtv;
  const avoidedExposure = staticBorrow - pegShieldBorrow;
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(state.timestamp));

  let action = 'allow new loans at PegShield safeLtv()';
  if (stateIsCritical) {
    action = 'halt new loans or force emergency fallback because regime is CRITICAL';
  } else if (stateIsStale) {
    action = 'reject new borrows until the oracle refreshes';
  }

  console.log('PegShield lending reference consumer');
  console.log(`Source:               ${source}`);
  console.log(`Risk State PDA:       ${address}`);
  console.log(`Collateral Scenario:  ${collateralUnits} ${symbol} @ ${formatUsd(unitPriceUsd)} each`);
  console.log(`Collateral Value:     ${formatUsd(collateralValueUsd)}`);
  console.log(`Static 80% policy:    would lend ${formatUsd(staticBorrow)}`);
  console.log(
    `PegShield safeLtv():  would lend ${formatUsd(pegShieldBorrow)} (${formatUsd(avoidedExposure)} exposure avoided)`,
  );
  console.log(`Oracle suggestedLtv:  ${(state.suggestedLtv * 100).toFixed(1)}%`);
  console.log(`Enforced safeLtv():   ${(enforcedLtv * 100).toFixed(1)}%`);
  console.log(
    `Regime / freshness:   ${stateIsCritical ? 'CRITICAL' : 'NORMAL'} / ${
      stateIsStale ? `STALE (${ageSeconds}s old)` : `FRESH (${ageSeconds}s old)`
    }`,
  );
  console.log(
    `Model diagnostics:    theta=${state.theta.toFixed(4)} sigma=${state.sigma.toFixed(4)} z=${state.zScore.toFixed(4)}`,
  );
  console.log(`Action:               ${action}`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
