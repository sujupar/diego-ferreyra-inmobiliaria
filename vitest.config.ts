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
    //
    // Mismo problema, fuente nueva (2026-08-07): `.claude/worktrees/` son copias
    // COMPLETAS del repo que crean otras sesiones para trabajar aisladas. Vitest
    // las levantaba y corría cada test dos veces — una con la config de acá, que
    // no es la suya: 14 archivos y 70 tests en rojo por código que ni siquiera
    // está en esta rama. Los tests de un worktree se corren DENTRO del worktree.
    exclude: ['**/node_modules/**', '.next', '.netlify', '**/.claude/worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
