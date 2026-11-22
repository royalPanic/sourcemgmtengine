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
    // Sourcemaps are useful while debugging a dev build but ship the full
    // TypeScript source inside the bundle, so they are opt-in for releases.
    sourcemap: !process.env.TAURI_ENV_RELEASE,
    // TipTap + ProseMirror push the main chunk past the default warning limit.
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 1420,
    strictPort: true,
  },
})