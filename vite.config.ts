import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // TipTap + ProseMirror push the main chunk past the default warning limit.
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 1420,
    strictPort: true,
  },
})