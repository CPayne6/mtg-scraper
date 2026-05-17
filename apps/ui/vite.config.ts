import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter(),
    react()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true, // Listen on all addresses
    watch: {
      usePolling: true, // Enable polling for Docker volumes
    },
  },
  build: {
    // @scoutlgs/shared compiles to CJS — workspace packages bypass Rollup's
    // default commonjs plugin (it only matches node_modules), so opt them in
    // explicitly. Required for Vite to detect Condition/QUEUE_NAMES/etc. as
    // named exports.
    commonjsOptions: {
      include: [/packages[\\/]shared/, /node_modules/],
    },
  },
  optimizeDeps: {
    // Dev-mode equivalent of the commonjsOptions above: force esbuild to
    // pre-bundle the workspace CJS package so named exports are detectable.
    include: ['@scoutlgs/shared'],
  },
})
