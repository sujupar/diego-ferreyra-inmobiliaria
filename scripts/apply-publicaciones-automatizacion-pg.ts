/**
 * Aplica la migración de comentarios desde Publicaciones y verifica columnas y restricciones. Idempotente.
 * Correr: node --env-file=.env.local --import tsx scripts/apply-publicaciones-automatizacion-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261104000002_publicaciones_automatizacion.sql'

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
      `SELECT table_name || '.' || column_name AS col, data_type FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name, column_name) IN (
            ('publicacion_videos','property_id'), ('publicacion_videos','automatizacion'),
            ('publicacion_videos','reel_id'), ('publicacion_videos','automatizacion_error'),
            ('property_reels','fb_video_id'), ('property_reels','fb_post_id'), ('reel_comentarios','plataforma'))`,
    )
    const col = new Map(rows.map((r) => [r.col as string, r.data_type as string]))
    exigir(col.size === 7, 'existen las 7 columnas nuevas')
    exigir(col.get('publicacion_videos.automatizacion') === 'jsonb', 'automatizacion es jsonb')
    const { rows: chk } = await c.query(
      `SELECT conname FROM pg_constraint WHERE conname IN
        ('property_reels_fb_video_id_key','property_reels_fb_post_id_key','reel_comentarios_plataforma_check')`,
    )
    exigir(chk.length === 3, 'existen los dos UNIQUE de Facebook y el CHECK de plataforma')
    const { rows: viejos } = await c.query(`SELECT count(*)::int AS n FROM public.reel_comentarios WHERE plataforma <> 'instagram'`)
    exigir(viejos[0].n === 0, 'los comentarios existentes quedaron como de Instagram')
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
