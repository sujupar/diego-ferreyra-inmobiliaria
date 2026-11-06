import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Config ACOTADA a la landing B de tasación ("Tasación Neta") y sus textos.
 * Mismo motivo que las demás configs acotadas: la raíz rastrea el proyecto
 * entero en iCloud y tarda minutos. La prueba de la página pide happy-dom con
 * su directiva en la primera línea.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/funnel/video-keys.test.ts',
      'lib/funnel/content-landing-b.test.ts',
      'app/**/tasacion-directa/*.test.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
