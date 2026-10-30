// Config ACOTADA para la validación de la sesión (spec
// docs/superpowers/specs/2026-10-29-sesion-rapida-design.md). La raíz rastrea
// el proyecto entero en iCloud y tarda minutos (ver CLAUDE.md § iCloud).
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/auth/**/*.test.ts',
      'lib/supabase/middleware.test.ts',
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
