import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Cross-origin access to the admin console.
   *
   * CORS is NOT authorization — the driver API authenticates every request with
   * a bearer token, and the admin routes with the existing session cookie. This
   * only tells the browser which origins may read responses.
   */
  async headers() {
    const origin = process.env.CONSOLE_ORIGIN ?? "http://localhost:3100";
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: origin },
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, OPTIONS" },
        ],
      },
    ];
  },
};

export default nextConfig;