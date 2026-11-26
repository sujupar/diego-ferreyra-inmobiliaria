import { defineConfig } from 'vitest/config'
import path from 'path'

/** Config ACOTADA a la lista de exclusión de Meta (la raíz rastrea el proyecto entero en iCloud y tarda minutos). */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/marketing/exclusion-pidieron-tasacion.test.ts'],
    exclude: ['**/node_modules/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
