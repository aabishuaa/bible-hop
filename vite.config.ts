import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The client is a single-page app. In development Vite serves it and passes /api to the game server.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist/client', emptyOutDir: true, sourcemap: false, target: 'es2022', chunkSizeWarningLimit: 900 },
  server: { port: 5173, host: true, proxy: { '/api': { target: `http://localhost:${process.env.PORT || 8787}`, changeOrigin: false } } },
});
