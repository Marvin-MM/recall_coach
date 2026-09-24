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
  // Enables forbidden()/unauthorized() for the admin evidence page.
  experimental: { authInterrupts: true },
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
  // There is no separate admin login: admins sign in with Google like everyone
  // else, and /admin/evidence checks ADMIN_EMAILS server-side.
  async redirects() {
    return [
      { source: "/admin", destination: "/admin/evidence", permanent: false },
      { source: "/admin/login", destination: "/admin/evidence", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
