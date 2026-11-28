import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Config ACOTADA al radar de referencias de Instagram.
 *
 * POR QUÉ EXISTE: la config raíz rastrea el proyecto entero, que vive en iCloud
 * y arrastra videos, capturas y `node_modules` anidados. Correr un solo archivo
 * con ella tarda minutos (a veces se queda clavada sin consumir CPU). Con el
 * `include` recortado a lo que se está tocando, la misma suite corre en ~0,5 s.
 *
 * Entorno node: todo el radar es lógica pura y rutas de API.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'radar/**/*.test.ts',
      'lib/video-refs/**/*.test.ts',
      'app/api/video-refs/**/*.test.ts',
      'app/api/cron/radar-watchdog/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
