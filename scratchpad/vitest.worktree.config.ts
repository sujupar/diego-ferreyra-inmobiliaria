// CÓMO CORRER LA SUITE DENTRO DE UN WORKTREE (no se commitea).
//
//   ./node_modules/.bin/vitest run --config scratchpad/vitest.worktree.config.ts --silent=true
//
// Es `vitest.config.ts` con UNA diferencia: `cacheDir` propia. Nada más.
//
// EL PROBLEMA QUE RESUELVE. En un worktree, `node_modules` es un SYMLINK al del
// proyecto original, y ahí adentro vive `node_modules/.vite`: la caché de
// dependencias pre-bundleadas de Vite. Los dos árboles escriben en la MISMA
// caché con raíces distintas, así que el que corre segundo levanta las
// dependencias optimizadas para el otro. El resultado no es un error claro sino
// dependencias a medio armar, y la suite miente de una forma que parece código
// roto:
//
//   TypeError: (0 , helpers_1.supportsLocalStorage) is not a function   <- @supabase/auth-js
//   TypeError: _cookies1.ResponseCookies is not a constructor           <- next/server
//
// Los archivos mueren AL IMPORTAR, sin correr una sola prueba, y el número
// cambia de corrida en corrida (118 archivos en rojo, después 25, después 22)
// según quién haya tocado la caché último. Ninguno tiene que ver con la rama:
// `lib/copy/rioplatense.test.ts`, que esta rama no toca ni por transitividad,
// fallaba acá y pasaba en la carpeta original.
//
// Medido el 2026-08-10 en `fix/scroll-lateral-movil`: con la config del
// proyecto, 22 archivos en rojo; con esta, 249 archivos / 2913 pruebas, todo
// verde. Mismo código, misma `node_modules`, lo único distinto es dónde queda la
// caché.
import { defineConfig } from 'vitest/config'
import path from 'path'

const raiz = path.resolve(__dirname, '..')

export default defineConfig({
  cacheDir: path.resolve(__dirname, '.vite-cache'),
  test: {
    environment: 'node',
    globals: true,
    root: raiz,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '.next', '.netlify', '**/.claude/worktrees/**', 'scratchpad/**'],
  },
  resolve: { alias: { '@': raiz } },
})
