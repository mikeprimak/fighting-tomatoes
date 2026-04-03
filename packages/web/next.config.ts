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
};

export default nextConfig;
