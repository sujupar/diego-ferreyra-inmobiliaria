/**
 * Aplica la migración del radar de referencias y VERIFICA el resultado.
 * Aborta (exit 1) si algo no cuadra.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-radar-referencias-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261128000001_radar_referencias.sql'

const COLUMNAS = [
  'fuente', 'ig_shortcode', 'video_storage_path', 'portada_storage_path', 'formato',
  'comentarios_analisis', 'transcripcion', 'categoria', 'tema_categoria', 'puntaje',
  'oculta', 'no_sirve_motivo', 'no_sirve_at', 'radar_run_id',
]
const TABLAS = ['radar_cuentas', 'radar_busquedas', 'radar_vistos', 'radar_corridas', 'radar_config']

function exigir(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD (está en .env.local)')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  try {
    await c.query(readFileSync(MIGRACION, 'utf8'))

    const { rows: cols } = await c.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='video_refs'`)
    const faltan = COLUMNAS.filter(n => !cols.some(r => r.column_name === n))
    exigir(faltan.length === 0, `faltan columnas en video_refs: ${faltan.join(', ')}`)

    const { rows: tablas } = await c.query<{ tablename: string; rowsecurity: boolean }>(
      `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)`, [TABLAS])
    exigir(tablas.length === TABLAS.length, 'no existen las 5 tablas radar_*')
    exigir(tablas.every(t => t.rowsecurity), 'alguna tabla radar_* sin RLS')

    const { rows: [visibles] } = await c.query(
      `SELECT count(*)::int AS n FROM public.video_refs WHERE fuente='openclaw' AND oculta=false`)
    exigir(visibles.n === 0, `hay ${visibles.n} filas openclaw sin ocultar`)

    const { rows: [cfg] } = await c.query(`SELECT count(*)::int AS n FROM public.radar_config`)
    exigir(cfg.n === 9, `radar_config tiene ${cfg.n} filas, esperaba 9`)

    const { rows: [bq] } = await c.query(
      `SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='video-refs'`)
    exigir(!!bq && bq.public === false, 'el bucket video-refs no existe o es público')
    exigir(Number(bq.file_size_limit) === 52428800, 'límite del bucket incorrecto')

    const { rows: [bs] } = await c.query(`SELECT count(*)::int AS n FROM public.radar_busquedas`)
    const { rows: [tot] } = await c.query(`SELECT count(*)::int AS n FROM public.video_refs`)
    console.log(`columnas OK (${COLUMNAS.length}) · tablas+RLS OK (${TABLAS.length}) · radar_config=${cfg.n} · busquedas=${bs.n}`)
    console.log(`video_refs total=${tot.n}, openclaw visibles=${visibles.n} · bucket privado, ${bq.file_size_limit} bytes, ${bq.allowed_mime_types}`)
  } finally {
    await c.end()
  }
  console.log('\nOK')
}

main().catch(e => { console.error('ERROR:', e instanceof Error ? e.message : e); process.exit(1) })
