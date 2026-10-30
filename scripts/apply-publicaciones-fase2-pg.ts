/**
 * Aplica la migración de la fase 2 de Publicaciones y la verifica. Idempotente.
 * Correr: node --env-file=.env.local --import tsx scripts/apply-publicaciones-fase2-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261030000001_publicaciones_limpieza.sql'

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD (está en .env.local)')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  try {
    await c.query(readFileSync(MIGRACION, 'utf8'))
    const { rows: [col] } = await c.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = 'publicacion_videos' AND column_name = 'archivo_borrado_at'`,
    )
    if (col.n !== 1) throw new Error('no quedó la columna archivo_borrado_at')
    console.log('✓ columna archivo_borrado_at')
    const { rows: [idx] } = await c.query(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'publicacion_envios_pendientes_idx'`,
    )
    if (idx.n !== 1) throw new Error('no quedó el índice publicacion_envios_pendientes_idx')
    console.log('✓ índice de envíos pendientes')
    const { rows: [fn] } = await c.query(
      `SELECT has_function_privilege('authenticated', 'public.publicacion_videos_para_limpiar(int, timestamptz)', 'EXECUTE') AS auth,
              has_function_privilege('service_role', 'public.publicacion_videos_para_limpiar(int, timestamptz)', 'EXECUTE') AS srv`,
    )
    if (fn.auth !== false || fn.srv !== true) throw new Error('la función de limpieza tiene permisos equivocados')
    console.log('✓ función de limpieza (solo service_role)')
    console.log('\nOK publicaciones fase 2')
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
