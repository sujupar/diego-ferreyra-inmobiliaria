import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Config ACOTADA al Tablero de /metrics (pantalla A) y al panel del que reusa la
 * lógica. Mismo motivo que las demás configs acotadas: la raíz rastrea el
 * proyecto entero en iCloud y tarda minutos.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/metrics/tablero/*.test.ts',
      'components/metrics/tablero/*.test.tsx',
      'lib/metrics/panel/panel.test.ts',
      'lib/metrics/panel/video-cohortes.test.ts',
    ],
    exclude: ['**/node_modules/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
