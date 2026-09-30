import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/portals/edicion-comun.test.ts',
      'lib/portals/cambios-ficha.test.ts',
      'lib/portals/worker-logic.test.ts',
      'lib/portals/mercadolibre/*.test.ts',
      'lib/portals/argenprop/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
