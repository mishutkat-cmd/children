import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // All `from 'framer-motion'` imports across the SPA resolve to the
      // local shim by default. Shared components (AnimatedCard, ParentTaskCard,
      // ChildStatsCard, MetricCard, …) used to drag ~30 KB gz of
      // framer-motion into every lazy page chunk; the shim renders plain
      // DOM and silently drops motion props, eliminating that cost.
      {
        find: /^framer-motion$/,
        replacement: path.resolve(__dirname, 'src/lib/motion-shim.tsx'),
      },
      // Escape hatch for files that genuinely need real animation
      // (Celebration, PointsAnimation, PurchaseAnimation, AchievementUnlocked):
      // they import from 'framer-motion-real' and get the real package.
      { find: 'framer-motion-real', replacement: 'framer-motion' },
    ],
  },
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
