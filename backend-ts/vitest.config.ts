import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // vite-tsconfig-paths v5 fails to normalise relative .js → .ts imports that originate
    // from deep inside the source tree (e.g. ../../redis/redis.module.js from nonce.store.ts).
    // The regex alias here ensures vite can find the TypeScript file regardless of call depth.
    alias: [
      {
        find: /.*\/redis\/redis\.module\.js$/,
        replacement: resolve(__dirname, 'src/redis/redis.module.ts'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
