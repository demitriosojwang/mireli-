import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The console talks to the Mireli API. In development that is the passenger
  // site on a different port; a rewrite avoids CORS entirely and keeps the
  // admin cookie first-party, which matters because it is an httpOnly session.
  async rewrites() {
    const api = process.env.MIRELI_API_ORIGIN ?? "http://localhost:3000";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;