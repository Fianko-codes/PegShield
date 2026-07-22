import type { SVGProps } from "react";

/**
 * PegShield mark: a shield whose interior is a peg reference line with a
 * deviation dip that the shield "catches". Uses currentColor for the frame and
 * the emerald token for the signal line.
 */
export function Logo({ size = 26, ...rest }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M16 2.4 27 6.2v8.3c0 7-4.6 12.4-11 15.1C9.6 26.9 5 21.5 5 14.5V6.2L16 2.4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <path
        d="M9 15.4h3.1l2-4.2 2.4 8 1.9-3.8H23"
        stroke="var(--emerald)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        color: "var(--text)",
      }}
    >
      <Logo size={size} style={{ color: "var(--text)" }} />
      <span
        style={{
          fontWeight: 580,
          fontSize: "1.06rem",
          letterSpacing: "-0.03em",
        }}
      >
        Peg<span style={{ color: "var(--text-2)" }}>Shield</span>
      </span>
    </span>
  );
}

export function IconArrow(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconExternal(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" {...props}>
      <path d="M5 3h6v6M11 3 4 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M3 8.4 6.3 11.7 13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBlock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconX(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconCopy(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
