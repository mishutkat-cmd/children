import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    target: 'ES2020',
    rollupOptions: {
      output: {
        // Only force react into a stable shared chunk. Forcing @mui/material into
        // a single vendor-mui chunk defeated per-route splitting — every lazy
        // page pulled the full ~95KB gz of MUI components used anywhere in the
        // app. Letting Rollup split MUI naturally puts each lazy page on a
        // diet (initial cost drops, page chunks share a smaller MUI core).
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: parseInt(process.env.PORT || '5173', 10),
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@mui/material', '@tanstack/react-query'],
  },
})
