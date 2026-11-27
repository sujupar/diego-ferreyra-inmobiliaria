// Config ACOTADA del change `tasacion-video-bienvenida` (la raíz rastrea el proyecto entero
// y tarda minutos: CLAUDE.md § "Correr las pruebas en esta Mac"). Propia para no tocar la
// del CRM, que otra sesión edita en paralelo. Los globs evitan `[id]` y `(dashboard)`.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/video-bienvenida/**/*.test.ts',
      'components/funnel/FunnelClickToPlayVideo*.test.tsx',
      'components/video-bienvenida/**/*.test.tsx',
      'lib/funnel/side-effect-handlers*.test.ts',
      'lib/funnel/video-keys*.test.ts',
      'lib/ai/tasacion-agent*.test.ts',
      'lib/crm/linea-de-tiempo*.test.ts',
      'lib/supabase/linea-de-tiempo*.test.ts',
      'lib/supabase/cartera*.test.ts',
      'lib/metrics/panel/video-bienvenida*.test.ts',
      'app/api/public/video/**/*.test.ts',
      'app/api/contacts/*/video-bienvenida/**/*.test.ts',
      'app/api/funnels/metrics/**/*.test.ts',
      'app/t/**/*.test.ts',
      'middleware*.test.ts',
      'lib/supabase/middleware*.test.ts',
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
