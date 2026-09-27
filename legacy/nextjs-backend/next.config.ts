import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Hide the floating dev-tools bubble in development — it overlapped page
  // content (bottom-left) and read as a UI bug during demos.
  devIndicators: false,
};

export default nextConfig;
