import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Config ACOTADA a la medición del video de las landings y su panel de
 * registrados vs no registrados. Mismo motivo que las demás configs acotadas:
 * la raíz rastrea el proyecto entero en iCloud y tarda minutos.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/funnel/video-progress.test.ts',
      'lib/funnel/video-pendiente.test.ts',
      'lib/funnel/video-keys.test.ts',
      'lib/metrics/panel/video-cohortes.test.ts',
    ],
    exclude: ['**/node_modules/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
