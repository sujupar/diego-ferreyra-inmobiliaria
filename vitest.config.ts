import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // `'node_modules'` solo excluye el de la raíz. Los proyectos anidados bajo
    // `video/` traen su propio node_modules con los tests del PAQUETE zod adentro,
    // y Vitest los levantaba: 6 archivos en rojo por dependencias que no son
    // nuestras. Una suite que siempre se ve rota es una suite que nadie mira, y
    // así es como un fallo de verdad pasa desapercibido.
    exclude: ['**/node_modules/**', '.next', '.netlify'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
