// Config ACOTADA: la raíz rastrea el proyecto entero en iCloud y tarda minutos
// (ver CLAUDE.md § "Correr las pruebas en esta Mac"). Solo lo que toca el
// sistema de visitas (spec docs/superpowers/specs/2026-10-10-sistema-de-visitas-design.md).
// Los globs evitan `[id]` y `(dashboard)`: picomatch los lee como clase de
// caracteres y grupo, y el archivo nunca matchea.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/visitas/**/*.test.ts',
      'lib/portals/fichas-fusionadas.test.ts',
      'lib/leads/visit-scheduling.test.ts',
      'lib/leads/responder-consulta.test.ts',
      'lib/leads/resolve-crm-visit-lead.test.ts',
      'app/api/visits/**/*.test.ts',
      'app/api/properties/*/interesados/*.test.ts',
      'components/visitas/**/*.test.tsx',
      'app/*/visits/**/*.test.tsx',
      'app/*/properties/_components/PropertyDetailModal.test.tsx',
    ],
    exclude: ['**/node_modules/**', '.next', '.netlify'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
})
