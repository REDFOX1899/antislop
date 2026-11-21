import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
