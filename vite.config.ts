import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: 'localhost',
    port: 4173,
    strictPort: true,
  },
});