// Config ACOTADA del informe quincenal (la raíz rastrea todo el proyecto en iCloud y tarda minutos;
// ver CLAUDE.md § "Correr las pruebas en esta Mac"). Spec docs/superpowers/specs/2026-10-22-informe-quincenal-design.md.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/informes/**/*.test.ts',
      'lib/properties/detail-view.test.ts',
      'app/api/informes/**/*.test.ts',
      'app/api/properties/*/informes/*.test.ts',
      'components/informes/**/*.test.tsx',
      'app/*/informes/**/*.test.tsx',
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
