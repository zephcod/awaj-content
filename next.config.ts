import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-appwrite"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.facebook.com" },
    ],
  },
  experimental: {
    serverActions: {
      // Photo/video uploads flow through server actions
      bodySizeLimit: "200mb",
    },
  },
  webpack: (config, { nextRuntime }) => {
    // instrumentation.ts is compiled for both the nodejs and edge runtimes
    // (dev mode does this unconditionally). Its Node-only code path (via
    // lib/igqueue -> lib/storage -> node-appwrite/file) is guarded at
    // runtime by NEXT_RUNTIME !== "nodejs" and never reached on edge, but
    // webpack still needs `fs` to resolve for that bundle to compile.
    if (nextRuntime === "edge") {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }
    return config;
  },
};

export default nextConfig;
