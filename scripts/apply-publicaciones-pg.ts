/**
 * Aplica la migración de Publicaciones y VERIFICA que quedó como tiene que quedar.
 * Aborta (exit 1) ante cualquier diferencia: no alcanza con que el SQL "corra".
 *
 * Es idempotente: se puede volver a correr cuando se quiera chequear la base.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-publicaciones-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261029000010_publicaciones.sql'
const TABLAS = [
  'publicacion_tandas',
  'publicacion_videos',
  'publicacion_envios',
  'publicacion_conexiones',
  'publicacion_ajustes',
]

function exigir(condicion: unknown, mensaje: string): void {
  if (!condicion) throw new Error(mensaje)
  console.log(`✓ ${mensaje}`)
}

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) {
    throw new Error('falta SUPABASE_DB_PASSWORD (está en .env.local)')
  }
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

    const { rows: tablas } = await c.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [TABLAS],
    )
    exigir(tablas.length === TABLAS.length, `existen las ${TABLAS.length} tablas`)

    const { rows: ajustes } = await c.query(`SELECT publicacion_automatica FROM public.publicacion_ajustes`)
    exigir(
      ajustes.length === 1 && ajustes[0].publicacion_automatica === false,
      'publicacion_ajustes tiene 1 fila con la publicación automática APAGADA',
    )

    const { rows: politicas } = await c.query(
      `SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'publicacion_conexiones'`,
    )
    exigir(politicas[0].n === 0, 'publicacion_conexiones no tiene ninguna política (tokens inaccesibles)')

    const { rows: rls } = await c.query(
      `SELECT count(*)::int AS n FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1) AND relrowsecurity`,
      [TABLAS],
    )
    exigir(rls[0].n === TABLAS.length, 'RLS habilitada en las 5 tablas')

    const { rows: [bucket] } = await c.query(
      `SELECT public, file_size_limit FROM storage.buckets WHERE id = 'contenido-videos'`,
    )
    exigir(
      bucket?.public === true && Number(bucket.file_size_limit) === 209715200,
      'bucket contenido-videos público con límite de 200 MB',
    )

    // Un envío duplicado (mismo video y red) tiene que rebotar con 23505.
    await c.query('BEGIN')
    let codigo: string | undefined
    try {
      const { rows: [t] } = await c.query(
        `INSERT INTO public.publicacion_tandas DEFAULT VALUES RETURNING id`,
      )
      const { rows: [v] } = await c.query(
        `INSERT INTO public.publicacion_videos (tanda_id, orden, nombre_archivo, tamano_bytes)
         VALUES ($1, 0, '[TEST] verificación.mp4', 1000) RETURNING id`,
        [t.id],
      )
      await c.query(`INSERT INTO public.publicacion_envios (video_id, plataforma) VALUES ($1, 'instagram')`, [v.id])
      await c.query(`INSERT INTO public.publicacion_envios (video_id, plataforma) VALUES ($1, 'instagram')`, [v.id])
    } catch (e) {
      codigo = (e as { code?: string }).code
    } finally {
      await c.query('ROLLBACK')
    }
    exigir(codigo === '23505', 'un envío duplicado (video, red) rebota con 23505')

    console.log('\nOK publicaciones')
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
