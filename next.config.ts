import type { NextConfig } from "next";
// Validate env at build/dev start so misconfiguration fails fast.
import "./src/env";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The MemWal SDK and its Mysten peers are server-only and ship ESM with
  // optional crypto paths; keep them out of the server bundle graph.
  serverExternalPackages: [
    "@mysten-incubation/memwal",
    "@mysten/sui",
    "@mysten/seal",
    "@mysten/walrus",
    "pg",
    "ws",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
