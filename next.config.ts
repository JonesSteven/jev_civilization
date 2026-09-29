import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    // Same-origin only: no remote fonts, images, scripts, or API calls from the browser (AC18).
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'" +
      (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") +
      "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Do not write AGENTS.md / CLAUDE.md into the repository during `next dev`.
  agentRules: false,
  poweredByHeader: false,
  serverExternalPackages: [],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
