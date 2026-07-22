const USD0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const USD2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function usd(value: number, decimals: 0 | 2 = 0): string {
  if (!Number.isFinite(value)) return "—";
  return (decimals === 0 ? USD0 : USD2).format(value);
}

/** Compact USD, e.g. $1.2M, $52K. */
export function usdCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return usd(value, value % 1 === 0 ? 0 : 2);
}

export function pct(value01: number, decimals = 1): string {
  if (!Number.isFinite(value01)) return "—";
  return `${(value01 * 100).toFixed(decimals)}%`;
}

/** Percentage-point delta from a 0–1 fraction, e.g. 0.0675 -> "6.75 pp". */
export function pp(value01: number, decimals = 2): string {
  if (!Number.isFinite(value01)) return "—";
  return `${(value01 * 100).toFixed(decimals)} pp`;
}

/** Signed percent from a fraction, e.g. -0.024 -> "-2.40%". */
export function signedPct(value01: number, decimals = 2): string {
  if (!Number.isFinite(value01)) return "—";
  const v = value01 * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(decimals)}%`;
}

export function truncateAddress(addr: string, lead = 4, tail = 4): string {
  if (addr.length <= lead + tail + 1) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

/** "3 min ago", "just now", "2 h ago". */
export function relativeAge(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
