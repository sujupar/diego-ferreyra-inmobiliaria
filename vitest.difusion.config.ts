// Config ACOTADA: la raíz rastrea el proyecto entero en iCloud y tarda minutos
// (ver CLAUDE.md § "Correr las pruebas en esta Mac"). Solo lo que toca el
// desarrollo "datos de difusión en la visita + publicación en portales".
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/properties/fotos-incrustadas.test.ts',
      'lib/properties/materializar-fotos.test.ts',
      'lib/portals/**/*.test.ts',
      'lib/landing/enrich.test.ts',
      'lib/landing/questions-generator.test.ts',
      'lib/landing/answers-gate.test.ts',
      'lib/supabase/visit-data-sanear.test.ts',
      'components/properties/wizards/**/*.test.ts',
      'components/properties/wizards/**/*.test.tsx',
      'components/properties/LandingSection.test.tsx',
      'app/**/properties/new/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '.next', '.netlify', '**/.claude/worktrees/**'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
