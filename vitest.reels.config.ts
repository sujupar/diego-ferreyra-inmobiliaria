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
 * El entorno por defecto es node (la lógica pura, ~0,5 s). La prueba de la
 * tarjeta pide happy-dom con la directiva `// @vitest-environment happy-dom` en
 * su primera línea, igual que el resto de las pruebas de componente del repo.
 *
 * OJO en esta Mac: happy-dom son cientos de archivos y EN FRÍO tarda más de un
 * minuto en cargar — a veces el primer intento muere con "Failed to start
 * worker" a los 60 s exactos, que es un límite fijo de vitest y no se puede
 * subir por configuración. No es el código: reintentar y esperar.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/social/reels/**/*.test.ts',
      'lib/integrations/instagram/**/*.test.ts',
      'components/properties/reels/**/*.test.tsx',
    ],
    exclude: ['**/node_modules/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
