import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'fightcrewapp-backend.onrender.com',
      },
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: 'pub-*.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'dmxg5wxfqgb4u.cloudfront.net',
      },
      {
        protocol: 'https',
        hostname: '*.ufc.com',
      },
      {
        protocol: 'https',
        hostname: '*.tapology.com',
      },
    ],
  },
  // The Apple App Site Association file has no extension, so Vercel would serve
  // it as application/octet-stream. iOS requires application/json. (Served from
  // public/.well-known/ — Android's assetlinks.json gets the right type from its
  // extension automatically.)
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
};

export default nextConfig;
