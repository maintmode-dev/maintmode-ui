import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Emit a self-contained server bundle (.next/standalone) so the production
  // Docker image can run on a minimal node:slim base without node_modules.
  // See deployment/.build/Dockerfile.
  output: "standalone",
};

export default nextConfig;
