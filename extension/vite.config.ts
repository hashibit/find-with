import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import hotReloadExtension from 'hot-reload-extension-vite';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // hot-reload-extension-vite assumes Chrome extension context — skip in web dev mode
    ...(mode !== 'development'
      ? [
          hotReloadExtension({
            log: true,
            backgroundPath: 'src/background/index.ts',
            sidePanel: {
              path: 'src/sidepanel/index.tsx',
              htmlPath: 'src/sidepanel/index.html',
            },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        'cs-linkedin-job': resolve(__dirname, 'src/content-scripts/linkedin/job-detail.ts'),
        'cs-linkedin-apply': resolve(__dirname, 'src/content-scripts/linkedin/easy-apply.ts'),
        'cs-gmail': resolve(__dirname, 'src/content-scripts/gmail/email-reader.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
}));
