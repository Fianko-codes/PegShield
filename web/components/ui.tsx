"use client";

import { useState, type ReactNode } from "react";
import { useReveal } from "@/lib/hooks";
import { explorerAddress, explorerTx } from "@/lib/constants";
import { truncateAddress } from "@/lib/format";
import { IconCopy, IconCheck, IconExternal } from "./Brand";
import styles from "./ui.module.css";

export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
  style,
}: {
  children: ReactNode;
  delay?: number;
  as?: "div" | "section" | "li" | "article";
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useReveal<HTMLDivElement>();
  const Comp = Tag as "div";
  return (
    <Comp
      ref={ref}
      className={`reveal ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </Comp>
  );
}

export function SectionHead({
  kicker,
  title,
  lede,
  center = false,
}: {
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  center?: boolean;
}) {
  return (
    <Reveal
      className={`${styles.sectionHead} ${center ? styles.center : ""}`}
    >
      <span className="kicker">{kicker}</span>
      <h2 className="h2">{title}</h2>
      {lede ? <p className="lede">{lede}</p> : null}
    </Reveal>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`${styles.copyBtn} ${copied ? styles.copied : ""}`}
      aria-label={label ?? "Copy to clipboard"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
    >
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  );
}

export function AddressChip({
  address,
  kind = "address",
  label,
  copyable = true,
}: {
  address: string;
  kind?: "address" | "tx";
  label?: string;
  copyable?: boolean;
}) {
  const href = kind === "tx" ? explorerTx(address) : explorerAddress(address);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <a
        className={styles.addressChip}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={`${label ? label + " — " : ""}${address} · view on Solana Explorer (devnet)`}
      >
        {label ? <span style={{ color: "var(--text-3)" }}>{label}</span> : null}
        <span>{truncateAddress(address, 5, 5)}</span>
        <IconExternal />
      </a>
      {copyable ? <CopyButton value={address} label={`Copy ${label ?? "address"}`} /> : null}
    </span>
  );
}

export { styles as uiStyles };
