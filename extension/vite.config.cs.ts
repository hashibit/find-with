/**
 * Separate Vite config for content scripts.
 * Builds each content script as a self-contained IIFE bundle so that
 * no external chunk imports are needed — content scripts cannot easily
 * load sibling ES-module chunks in Chrome MV3.
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't clear the main build output
    rollupOptions: {
      input: {
        'cs-linkedin-job': resolve(__dirname, 'src/content-scripts/linkedin/job-detail.ts'),
        'cs-linkedin-apply': resolve(__dirname, 'src/content-scripts/linkedin/easy-apply.ts'),
        'cs-gmail': resolve(__dirname, 'src/content-scripts/gmail/email-reader.ts'),
      },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
        // IIFE bundles are self-contained — no chunk splitting
        inlineDynamicImports: false,
      },
    },
  },
});
