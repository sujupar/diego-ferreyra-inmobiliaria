// Config ACOTADA: la raíz rastrea el proyecto entero en iCloud y tarda minutos
// (ver CLAUDE.md § "Correr las pruebas en esta Mac"). Solo el agente de IA y la
// respuesta automática a consultas, que es lo que toca la palabra de reinicio.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/ai/**/*.test.ts', 'lib/leads/**/*.test.ts'],
    exclude: ['**/node_modules/**', '.next', '.netlify', '**/.claude/worktrees/**'],
  },
  // `server-only` no está instalado (lo aporta Next en el build): sin este
  // reemplazo, todo archivo de servidor que lo importe deja la prueba en rojo.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
})
