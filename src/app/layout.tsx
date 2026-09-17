import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { bootPrepaintScript } from "@/components/boot/prepaint";
import { BrandGradient } from "@/components/brand/BrandMark";
import { IS_MAINNET } from "@/content/deployment";
import { SITE } from "@/content/site";
import "./globals.css";

const geist = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

/**
 * Absolute origin for Open Graph and Twitter image URLs. An empty or malformed NEXT_PUBLIC_SITE_URL
 * (common when the variable is added to a host without a value) falls back to the deployment URL
 * Vercel provides, then to localhost, instead of failing the build.
 */
function siteUrl(): URL {
  const candidates = [process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    try {
      return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      // Malformed value: try the next source.
    }
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: SITE.title,
  description: SITE.description,
  applicationName: SITE.name,
  // The testnet subdomain mirrors the main site, so keep it out of search results.
  robots: IS_MAINNET ? undefined : { index: false, follow: false, googleBot: { index: false, follow: false } },
  keywords: ["Sherwood", "ZKx8004", "zero-knowledge", "x402", "Robinhood Chain", "EVM", "EIP-3009", "USDG", "private agents", "autonomous agents"],
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Sherwood logo" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@sherwoodpay",
    title: SITE.title,
    description: SITE.description,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#07110d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootPrepaintScript }} />
      </head>
      <body>
        <BrandGradient />
        {children}
      </body>
    </html>
  );
}
