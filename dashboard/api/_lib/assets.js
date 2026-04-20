export const DEFAULT_LST_ID = 'mSOL-v2';

export const SUPPORTED_ASSETS = {
  'msol-v2': {
    lstId: 'mSOL-v2',
    symbol: 'mSOL',
    label: 'Marinade',
    marketFeedId: '0xc2289a6a43d2ce91c6f55caec370f4acc38a2ed477f58813334c6d03749ff2a4',
  },
  'jitosol-v1': {
    lstId: 'jitoSOL-v1',
    symbol: 'jitoSOL',
    label: 'Jito',
    marketFeedId: '0x67be9f519b95cf24338801051f9a808eff0a578ccb388db73b7f6fe1de019ffb',
  },
  'bsol-v1': {
    lstId: 'bSOL-v1',
    symbol: 'bSOL',
    label: 'BlazeStake',
    marketFeedId: '0x89875379e70f8fbadc17aef315adf3a8d5d160b811435537e03c97e8aac97d9c',
  },
};

export function resolveSupportedAsset(candidate) {
  if (!candidate) {
    return SUPPORTED_ASSETS[DEFAULT_LST_ID.toLowerCase()];
  }

  const normalized = String(candidate).trim().toLowerCase();
  return (
    SUPPORTED_ASSETS[normalized] ||
    Object.values(SUPPORTED_ASSETS).find(
      (asset) =>
        asset.symbol.toLowerCase() === normalized ||
        asset.label.toLowerCase() === normalized,
    ) ||
    SUPPORTED_ASSETS[DEFAULT_LST_ID.toLowerCase()]
  );
}
