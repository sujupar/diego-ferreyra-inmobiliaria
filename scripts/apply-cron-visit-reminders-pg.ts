/**
 * Programa en pg_cron el recordatorio "¿se realizó?" (cada hora, minuto 5).
 *
 * REQUISITO: el código tiene que estar DEPLOYADO. Este script lo verifica solo (`?ping=1`)
 * y no programa nada si la ruta nueva no responde.
 *
 * El secreto NO se pasa ni se imprime: se reusa el de `cron_config('send_report')`, el
 * mismo de los reportes, meta-sync y mapa-lugares. El dominio sale del job `meta-sync`.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-cron-visit-reminders-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261015000001_cron_visit_reminders.sql'

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD (está en .env.local)')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  try {
    const { rows: [cfg] } = await c.query<{ value: string }>(`SELECT value FROM cron_config WHERE key = 'send_report'`)
    const { rows: [job] } = await c.query<{ sitio: string }>(`SELECT substring(command from 'https://([^/'']+)') AS sitio FROM cron.job WHERE jobname = 'meta-sync'`)
    const secreto: string | undefined = cfg?.value
    const sitio: string | undefined = job?.sitio
    if (!secreto) throw new Error('no está cron_config(send_report)')
    if (!sitio) throw new Error('no pude leer el dominio del job meta-sync')

    const ping = await fetch(`https://${sitio}/api/cron/visit-reminders?ping=1`)
      .then(r => r.json()).catch(() => null) as { ok?: boolean; route?: string } | null
    if (ping?.ok !== true || ping.route !== 'visit-reminders') {
      throw new Error(`https://${sitio}/api/cron/visit-reminders?ping=1 no responde con la ruta nueva: el código no está deployado. No se programa nada.`)
    }
    console.log(`deploy verificado en ${sitio}`)

    const sql = readFileSync(MIGRACION, 'utf8').replaceAll('__SECRETO__', secreto).replaceAll('__SITIO__', sitio)
    await c.query(sql)

    const { rows: [nuevo] } = await c.query(`SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'visit-reminders'`)
    const { rows: [clave] } = await c.query(`SELECT (value = $1) AS igual FROM cron_config WHERE key = 'visit_reminders'`, [secreto])
    console.log('job:', JSON.stringify(nuevo ?? null))
    if (!nuevo || nuevo.active !== true || nuevo.schedule !== '5 * * * *') throw new Error('el job visit-reminders no quedó activo con su horario')
    if (clave?.igual !== true) throw new Error('no quedó bien la fila cron_config(visit_reminders)')
  } finally {
    await c.end()
  }
  console.log('\n✅ job programado. Después del próximo minuto 5, verificar net._http_response (contenido con "ventana") y email_notifications_log.')
}

main().catch(e => { console.error('❌', e instanceof Error ? e.message : e); process.exit(1) })
