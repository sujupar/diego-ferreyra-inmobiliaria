// Config ACOTADA: la raíz rastrea el proyecto entero en iCloud y tarda minutos
// (ver CLAUDE.md § "Correr las pruebas en esta Mac"). Solo lo que toca el trabajo
// de "procesos manuales en el CRM".
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/deals/**/*.test.ts',
      'lib/supabase/deals*.test.ts',
      'lib/pipeline/**/*.test.ts',
      'app/api/deals/**/*.test.ts',
      'app/api/properties/**/*.test.ts',
      'components/deals/**/*.test.tsx',
      'components/pipeline/**/*.test.tsx',
    ],
    exclude: ['**/node_modules/**', '.next', '.netlify', '**/.claude/worktrees/**'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
