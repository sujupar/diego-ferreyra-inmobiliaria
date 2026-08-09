/**
 * Programa en pg_cron el worker de los avisos del embudo (cada minuto).
 *
 * REQUISITO: el código tiene que estar DEPLOYADO. El job le pega a
 * /api/cron/funnel-side-effects, que no existe hasta que el deploy termine.
 * Verificalo antes con:
 *   curl -s 'https://<dominio>/api/cron/funnel-side-effects?ping=1'
 * Tiene que responder {"ok":true,"route":"funnel-side-effects",...}.
 *
 * El secreto y el dominio se pasan por argumento — no se inventan. Se puede
 * reusar el que ya está en cron_config:
 *   SELECT value FROM cron_config WHERE key = 'send_report';
 *
 * Correr: npx tsx --env-file=.env.local scripts/apply-cron-funnel-side-effects-pg.ts <secreto> <dominio>
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20260808000002_cron_funnel_side_effects.sql'

async function main() {
  const [secreto, sitio] = process.argv.slice(2)
  if (!secreto || !sitio) {
    throw new Error('Faltan argumentos: <secreto> <dominio>. No se inventan.')
  }
  if (!process.env.SUPABASE_DB_PASSWORD) {
    throw new Error('falta SUPABASE_DB_PASSWORD (está en .env.local)')
  }

  const sql = readFileSync(MIGRACION, 'utf8')
    .replaceAll('__SECRETO__', secreto)
    .replaceAll('__SITIO__', sitio)

  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  // La cola tiene que existir antes: programar el job contra una tabla ausente
  // deja al worker devolviendo 500 cada minuto.
  const { rows: [previo] } = await c.query(
    `SELECT to_regclass('public.funnel_lead_jobs') IS NOT NULL AS existe`)
  if (previo.existe !== true) {
    await c.end()
    throw new Error('falta la tabla funnel_lead_jobs: corré primero scripts/apply-funnel-jobs-pg.ts')
  }

  await c.query(sql)

  const { rows: job } = await c.query(
    `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'funnel-side-effects'`)
  const { rows: cfg } = await c.query(
    `SELECT key FROM cron_config WHERE key = 'funnel_side_effects'`)
  await c.end()

  console.log('job:', JSON.stringify(job[0] ?? null))
  console.log('cron_config:', JSON.stringify(cfg[0] ?? null))

  if (!job[0]) throw new Error('el job funnel-side-effects no quedó creado')
  if (job[0].active !== true) throw new Error('el job quedó inactivo')
  if (!cfg[0]) throw new Error('no quedó la fila cron_config(funnel_side_effects)')

  console.log('\n✅ job programado. En 2 minutos verificar, en orden:')
  console.log("   1. SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;  -- 200")
  console.log("   2. SELECT status, count(*) FROM funnel_lead_jobs GROUP BY status;                      -- pending no se acumula")
}

main().catch(e => { console.error('❌', e instanceof Error ? e.message : e); process.exit(1) })
