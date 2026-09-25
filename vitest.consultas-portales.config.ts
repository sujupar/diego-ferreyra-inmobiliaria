// Config ACOTADA: la raíz rastrea el proyecto entero en iCloud y tarda minutos
// (ver CLAUDE.md § "Correr las pruebas en esta Mac"). Solo la ingesta de
// consultas de portales y lo que cuelga de ella.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/integrations/portal-inquiries/**/*.test.ts', 'lib/leads/**/*.test.ts'],
    exclude: ['**/node_modules/**', '.next', '.netlify', '**/.claude/worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` lo aporta Next en el build; sin este reemplazo, toda prueba
      // que alcance un módulo de servidor muere al cargar.
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
})
