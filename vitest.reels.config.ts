import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Config ACOTADA a los reels de Instagram.
 *
 * POR QUÉ EXISTE: la config raíz rastrea el proyecto entero, que vive en iCloud
 * y arrastra videos, capturas y `node_modules` anidados. Correr un solo archivo
 * con ella tarda minutos (a veces se queda clavada sin consumir CPU). Con el
 * `include` recortado a lo que se está tocando, la misma suite corre en ~0,5 s.
 *
 * Solo entorno node: acá adentro no hay componentes. Los `.test.tsx` de la
 * tarjeta se corren con la config raíz, que ya tiene happy-dom configurado.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/social/reels/**/*.test.ts',
      'lib/integrations/instagram/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
