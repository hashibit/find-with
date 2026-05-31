import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load test env before vitest spins up workers — must happen at config level
// so DATABASE_URL / REDIS_URL are set before any module is imported.
config({ path: resolve(import.meta.dirname, '../.env.test') });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
