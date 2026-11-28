// crm-cadencia-paula: lo que toca el cambio fuera de la config del CRM.
import { defineConfig } from 'vitest/config'
import path from 'node:path'
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/funnel/side-effect-handlers.test.ts', 'components/metrics/tablero/*.test.tsx', 'lib/metrics/tablero/llamadas.test.ts'],
    exclude: ['**/node_modules/**'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.'), 'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts') } },
})
