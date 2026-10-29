// Config ACOTADA: la raíz rastrea el proyecto entero en iCloud y tarda minutos
// (ver CLAUDE.md § iCloud). Solo lo que toca la sección Consultas
// (spec docs/superpowers/specs/ de la sección Consultas) y lo que reusa de visitas.
// Los globs evitan `[id]` y `(dashboard)`: picomatch los lee como clase de
// caracteres y grupo, y el archivo nunca matchea.
// NO se excluye `**/.claude/worktrees/**`: el desarrollo corre DENTRO de un
// worktree y esa exclusión dejaría sin pruebas a la config.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/consultas/**/*.test.ts',
      'app/api/consultas/**/*.test.ts',
      'components/consultas/**/*.test.tsx',
      'app/*/consultas/**/*.test.tsx',
      'lib/visitas/persona.test.ts',
      'lib/visitas/agendar-estado.test.ts',
      'components/visitas/agendar/**/*.test.tsx',
      'app/api/portal-inquiries/**/*.test.ts',
      'lib/nav/*.test.ts',
      'app/*/inbox/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '.next', '.netlify'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
})
