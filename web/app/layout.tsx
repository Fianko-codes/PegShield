import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "PegShield — On-chain collateral circuit breaker for LST lending";
const DESCRIPTION =
  "Price oracles tell lenders what LST collateral is worth. PegShield tells them whether to keep extending credit against it, and at what LTV — published on Solana devnet as an enforceable RiskState.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "PegShield",
  authors: [{ name: "PegShield" }],
  keywords: [
    "Solana",
    "LST",
    "collateral risk",
    "lending",
    "oracle",
    "circuit breaker",
    "mSOL",
    "jitoSOL",
    "LTV",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#090b0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Arm scroll-reveal only when JS can run — before first paint to avoid flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
