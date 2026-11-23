
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'presidential-dropped-gone-soc.trycloudflare.com',
      'regulation-assignment-partnerships-visited.trycloudflare.com',
      'http://localhost:5173'
    ],
    proxy: {
      '/api': 'http://localhost:8081'
    }
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true
  }
});

