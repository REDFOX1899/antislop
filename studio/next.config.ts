import type { NextConfig } from 'next';

const ENGINE_ORIGIN = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'https://antislop-engine-a53petnlfa-uc.a.run.app'
).replace(/\/$/, '');

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/mcp',
        destination: `${ENGINE_ORIGIN}/mcp`,
      },
      {
        source: '/.well-known/mcp.json',
        destination: `${ENGINE_ORIGIN}/.well-known/mcp.json`,
      },
    ];
  },
};

export default nextConfig;
