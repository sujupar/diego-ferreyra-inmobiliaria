import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Config ACOTADA a Publicaciones (mismo motivo que `vitest.reels.config.ts`: la
 * config raíz rastrea el proyecto entero en iCloud y tarda minutos o se cuelga).
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/publicaciones/**/*.test.ts', 'lib/nav/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
