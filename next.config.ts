import type { NextConfig } from "next";

/** Canonical origin of this deployment, taken from the same value the metadata uses. */
function canonicalOrigin(): URL | undefined {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) return undefined;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return undefined;
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  /**
   * Sends visitors on a retired host to the canonical site — typically the
   * *.vercel.app URL the platform keeps serving after a custom domain is added.
   * Set LEGACY_HOSTS to a comma-separated host list; preview hosts stay untouched.
   */
  async redirects() {
    const canonical = canonicalOrigin();
    if (!canonical) return [];

    return (process.env.LEGACY_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter((host) => host && host !== canonical.host)
      .map((host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host }],
        destination: `${canonical.origin}/:path*`,
        permanent: true,
      }));
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
