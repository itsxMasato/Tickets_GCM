import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'client',
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'public/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'client/index.html'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
