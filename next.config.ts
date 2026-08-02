import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Unoptimized images for Vercel & client-side rendering
  images: { unoptimized: true },
};

export default nextConfig;
