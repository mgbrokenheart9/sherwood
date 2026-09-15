import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { bootPrepaintScript } from "@/components/boot/prepaint";
import { BrandGradient } from "@/components/brand/BrandMark";
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: SITE.title,
  description: SITE.description,
  applicationName: SITE.name,
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
    site: "@zkx8004",
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
