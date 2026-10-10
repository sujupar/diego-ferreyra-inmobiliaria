// Config ACOTADA: la raíz rastrea el proyecto entero en iCloud y tarda minutos
// (ver CLAUDE.md § "Correr las pruebas en esta Mac"). Solo lo que toca el
// sistema de visitas (spec docs/superpowers/specs/2026-10-10-sistema-de-visitas-design.md).
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/visitas/**/*.test.ts',
      'lib/portals/fichas-fusionadas.test.ts',
    ],
    exclude: ['**/node_modules/**', '.next', '.netlify'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
