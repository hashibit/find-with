import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/dom.test.ts', 'jsdom'],
      ['tests/sanitize.test.ts', 'jsdom'],
      ['tests/easy-apply.test.ts', 'jsdom'],
    ],
    setupFiles: ['tests/setup.ts'],
  },
});
