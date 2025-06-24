import { defineConfig } from 'vite'
import path from "path"
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
    optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    watch: {
      usePolling: true,
    },
    hmr: {
      port: 3000,
    },
    headers: {
      // Add headers for SharedArrayBuffer and Atomics support (needed for SQLite WASM OPFS)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8080',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('Proxy error:', err);
          });
        },
      },
      '/_/': {
        target: process.env.VITE_API_URL || 'http://localhost:8080',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying for admin dashboard
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('Admin proxy error:', err);
          });
        },
      },
    },
  },
    resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
