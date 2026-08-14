import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keeps a navigation or a server action pending and retries it when the connection returns,
  // instead of throwing. Also exposes `useOffline` to client components.
  experimental: {
    useOffline: true,
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          // A cached service worker cannot be replaced remotely, so it must never be cached.
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
