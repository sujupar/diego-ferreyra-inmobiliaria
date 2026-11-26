// Config ACOTADA: la raíz rastrea el proyecto entero en iCloud y tarda minutos
// (ver CLAUDE.md § "Correr las pruebas en esta Mac"). Solo lo que toca el trabajo
// de "procesos manuales en el CRM" y el change `crm-ficha-y-llamadas` (design.md D10).
// Los globs evitan `[id]` y `(dashboard)`: picomatch los lee como clase de
// caracteres y grupo, y el archivo nunca matchea. Por eso van con `*`.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/deals/**/*.test.ts',
      'lib/supabase/deals*.test.ts',
      'lib/supabase/visit-data*.test.ts',
      'lib/pipeline/**/*.test.ts',
      'app/api/deals/**/*.test.ts',
      'app/api/properties/**/*.test.ts',
      'components/deals/**/*.test.tsx',
      'components/pipeline/**/*.test.tsx',
      // crm-ficha-y-llamadas (design.md D10)
      'lib/crm/**/*.test.ts',
      'lib/auth/**/*.test.ts',
      'lib/supabase/tasks*.test.ts',
      'lib/supabase/cadencia*.test.ts',
      'lib/supabase/contactos*.test.ts',
      'app/api/contacts/**/*.test.ts',
      'app/api/appraisals/*/contact/**/*.test.ts',
      'app/api/tasks/**/*.test.ts',
      'components/crm/**/*.test.tsx',
      'components/contacts/**/*.test.tsx',
      'app/*/contacts/**/*.test.tsx',
      'app/*/crm/**/*.test.tsx',
      'app/*/pipeline/**/*.test.tsx',
    ],
    exclude: ['**/node_modules/**', '.next', '.netlify', '**/.claude/worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
})
