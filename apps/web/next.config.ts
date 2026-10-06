import path from "node:path";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Next.js has already loaded apps/web env files; forceReload is needed to read the root .env.
loadEnvConfig(path.resolve(process.cwd(), "../.."), process.env.NODE_ENV !== "production", console, true);

function tunnelHosts(): string[] {
  const url = process.env.WEBAPP_URL;
  if (!url?.startsWith("https://")) {
    return [];
  }
  return [new URL(url).hostname];
}

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins: tunnelHosts(),
  async rewrites() {
    const target = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${target.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
    NEXT_PUBLIC_APP_ENV: process.env.APP_ENV ?? "development",
  },
};

export default nextConfig;
