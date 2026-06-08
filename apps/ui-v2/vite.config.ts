import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    tanstackRouter(),
    react(),
  ],
  resolve: {
    // Pull @scoutlgs/shared straight from its TypeScript source. The package's
    // dist is CommonJS (consumed by the NestJS apps via require) and Vite's
    // optimizeDeps pre-bundle doesn't run on workspace symlinks, so loading
    // dist would surface `does not provide an export named X` ESM errors.
    // Sourcing from .ts sidesteps the whole CJS-in-ESM problem and TypeScript
    // type-resolution still flows through node_modules/@scoutlgs/shared/dist.
    alias: [
      {
        find: /^@scoutlgs\/shared$/,
        replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  server: {
    port: 3000,
    host: true,
    watch: {
      usePolling: true,
    },
  },
})
