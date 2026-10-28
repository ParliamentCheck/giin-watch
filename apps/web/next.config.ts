import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  async redirects() {
    // 表示単位を政党から会派に切り替えた（2026-10）。旧「政党」は衆参の複数の会派にまたがるため、
    // 特定の会派ページに決め打ちせず会派一覧に集約する（設計書 claude/design_kaiha_v1.md 6章）
    return [
      { source: "/parties", destination: "/factions", statusCode: 301 },
      { source: "/parties/:party*", destination: "/factions", statusCode: 301 },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options",  value: "nosniff" },
          { key: "X-Frame-Options",          value: "DENY" },
          { key: "X-XSS-Protection",         value: "1; mode=block" },
          { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",       value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/(.*\\.(?:svg|png|jpg|jpeg|ico|webp))",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;
