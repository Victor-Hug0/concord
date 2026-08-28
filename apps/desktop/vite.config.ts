import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: './',
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Use TS source so Vite gets real ESM named exports (dist is CJS via NodeNext).
      '@concord/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
