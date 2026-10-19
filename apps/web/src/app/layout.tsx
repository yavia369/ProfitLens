import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ProfitLens", template: "%s · ProfitLens" },
  description: "Auditable profit analytics for Shopify stores.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Set by src/proxy.ts; the theme script runs before hydration and needs it under the CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-dvh font-sans">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
