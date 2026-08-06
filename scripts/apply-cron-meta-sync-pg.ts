/**
 * Programa el job diario `meta-sync` en pg_cron.
 *
 * REQUISITO: el código tiene que estar DEPLOYADO. El job hace un POST a
 * /api/cron/meta-sync, que no existe hasta que el deploy termine.
 *
 * El secreto y el dominio se pasan por argumento — no se inventan.
 * Se puede reusar el secreto que ya está en cron_config para los reportes:
 *   SELECT value FROM cron_config WHERE key = 'send_report';
 *
 * Correr: npx tsx --env-file=.env.local scripts/apply-cron-meta-sync-pg.ts <secreto> <dominio>
 * Ej:     ... apply-cron-meta-sync-pg.ts abc123 inmobiliariadiegoferreyra.com
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const [secreto, sitio] = process.argv.slice(2)
  if (!secreto || !sitio) {
    throw new Error('Faltan argumentos: <secreto> <dominio>. No se inventan.')
  }

  const sql = readFileSync('supabase/migrations/20260806000002_cron_meta_sync.sql', 'utf8')
    .replaceAll('__SECRETO__', secreto)
    .replaceAll('__SITIO__', sitio)

  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  await c.query(sql)

  const { rows: job } = await c.query(
    `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'meta-sync'`)
  const { rows: cfg } = await c.query(
    `SELECT key FROM cron_config WHERE key = 'meta_sync'`)
  const { rows: [datos] } = await c.query(
    `SELECT max(date)::text AS ultimo_dia FROM meta_ads_daily`)
  await c.end()

  console.log('job:', JSON.stringify(job[0] ?? null))
  console.log('cron_config:', JSON.stringify(cfg[0] ?? null))
  console.log('último día con inversión cargada:', datos.ultimo_dia)

  if (!job[0]) throw new Error('el job meta-sync no quedó creado')
  if (job[0].active !== true) throw new Error('el job quedó inactivo')
  if (!cfg[0]) throw new Error('no quedó la fila cron_config(meta_sync)')

  console.log('\n✅ job programado. Mañana verificar que el último día haya avanzado.')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
