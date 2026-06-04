import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import swc from 'unplugin-swc';
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Load test env before vitest spins up workers
config({ path: resolve(import.meta.dirname, '../.env.test') });

export default defineConfig({
  plugins: [
    // SWC must come first so it runs before tsconfigPaths transforms.
    // SWC with decoratorMetadata: true is required for NestJS DI to work —
    // esbuild (vitest default) strips decorator metadata, breaking reflect-metadata.
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: 'es2022',
      },
    }),
    tsconfigPaths(),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/http/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    server: {
      deps: {
        // express is an indirect dep (via @nestjs/platform-express) and not
        // hoisted into backend-ts/node_modules by pnpm strict hoisting.
        // Inline it so Vite can bundle the type-only import in user-auth.guard.ts.
        //
        // @bull-board/api exports `./bullMQAdapter` (no .js), but the source imports
        // `@bull-board/api/bullMQAdapter.js` — Vite's strict exports check fails.
        // Inlining lets Vite bundle it without going through the exports map.
        //
        // adminjs + @adminjs/* + @tiptap/*:
        // @tiptap/extension-horizontal-rule@2.27.x uses `canInsertNode` from
        // @tiptap/core@2.1.13, which doesn't export it as an ESM named export.
        // Inlining forces esbuild pre-bundling (CJS interop), avoiding the strict
        // ESM named-export check that Node.js enforces at runtime.
        // Patterns are matched against full module paths (pnpm virtual store),
        // so use contains-match (/adminjs/) not starts-with (/^adminjs/).
        inline: [
          'express',
          '@bull-board/api',
          /adminjs/,
          /@adminjs/,
          // @tiptap/extension-horizontal-rule@2.27.x imports `canInsertNode`
          // from @tiptap/core@2.1.13 which doesn't export it (ESM strict check).
          // Inlining via Vite/esbuild converts named imports to CJS-style property
          // access, so missing exports become undefined instead of throwing.
          /@tiptap/,
        ],
      },
    },
  },
});
