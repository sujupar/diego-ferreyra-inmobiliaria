/**
 * Aplica la migración de la carga desde Drive y verifica las columnas. Idempotente.
 * Correr: node --env-file=.env.local --import tsx scripts/apply-publicaciones-drive-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261104000010_publicaciones_drive.sql'

function exigir(condicion: unknown, mensaje: string): void {
  if (!condicion) throw new Error(mensaje)
  console.log(`✓ ${mensaje}`)
}

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
    const { rows } = await c.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'publicacion_videos'
          AND column_name IN ('drive_subida_url', 'drive_copiado_bytes')`,
    )
    const col = new Map(rows.map((r) => [r.column_name as string, r]))
    exigir(col.get('drive_subida_url')?.data_type === 'text', 'drive_subida_url es text')
    exigir(
      col.get('drive_copiado_bytes')?.data_type === 'bigint' && col.get('drive_copiado_bytes')?.is_nullable === 'NO',
      'drive_copiado_bytes es bigint NOT NULL',
    )
    const { rows: chk } = await c.query(`SELECT 1 FROM pg_constraint WHERE conname = 'publicacion_videos_drive_id_check'`)
    exigir(chk.length === 1, 'existe el CHECK de drive_file_id')
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
