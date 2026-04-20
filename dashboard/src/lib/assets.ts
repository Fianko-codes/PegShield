export const SUPPORTED_LSTS = [
  {
    lstId: 'mSOL-v2',
    symbol: 'mSOL',
    label: 'Marinade',
  },
  {
    lstId: 'jitoSOL-v1',
    symbol: 'jitoSOL',
    label: 'Jito',
  },
  {
    lstId: 'bSOL-v1',
    symbol: 'bSOL',
    label: 'BlazeStake',
  },
] as const;

export type SupportedLstId = (typeof SUPPORTED_LSTS)[number]['lstId'];

export const DEFAULT_LST_ID: SupportedLstId = 'mSOL-v2';

export function normalizeLstId(candidate?: string | null): SupportedLstId {
  if (!candidate) {
    return DEFAULT_LST_ID;
  }

  const normalized = candidate.trim().toLowerCase();
  const match = SUPPORTED_LSTS.find(
    (asset) =>
      asset.lstId.toLowerCase() === normalized ||
      asset.symbol.toLowerCase() === normalized ||
      asset.label.toLowerCase() === normalized,
  );
  return match?.lstId ?? DEFAULT_LST_ID;
}
