// Config ACOTADA para el bloque de datos de mercado del PDF (la raíz rastrea
// todo el proyecto en iCloud y tarda minutos; ver CLAUDE.md).
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/market-data/**/*.test.ts',
      'lib/pdf/**/*.test.ts',
      'app/api/settings/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '.next', '.netlify', '**/.claude/worktrees/**'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
