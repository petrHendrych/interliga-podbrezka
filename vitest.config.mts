import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': path.resolve(import.meta.dirname, 'test/mocks/server-only.ts'),
    },
  },
  test: {
    // `lib/db.ts` throws at import time without this; pure-function tests never query.
    env: {
      DATABASE_URL: 'postgres://user:pass@localhost:5432/test_db',
      JWT_SECRET: 'test-secret',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['lib/**/*.test.ts', 'locales/**/*.test.ts', 'proxy.test.ts'],
          exclude: ['lib/hooks/**'],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: [
            'components/**/*.test.tsx',
            'app/**/*.test.tsx',
            'lib/hooks/**/*.test.ts',
          ],
          setupFiles: ['./vitest.setup.dom.ts'],
        },
      },
    ],
  },
});
