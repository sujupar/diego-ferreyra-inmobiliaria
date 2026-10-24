/**
 * Programa en pg_cron el ciclo del informe quincenal (cada 2 minutos los días 1, 2, 16 y 17).
 *
 * REQUISITO: el código tiene que estar DEPLOYADO. Este script lo verifica solo (`?ping=1`)
 * y no programa nada si la ruta nueva no responde.
 *
 * El secreto NO se pasa ni se imprime: se reusa el de `cron_config('send_report')`, el
 * mismo de los reportes, meta-sync y mapa-lugares. El dominio sale del job `meta-sync`.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-cron-informes-quincenales-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { reemplazarPlaceholder, validarSecretoCron, validarSitioHttps } from '../lib/visitas/cron-secreto'

const MIGRACION = 'supabase/migrations/20261024000002_cron_informes_quincenales.sql'

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
    // Antes de tocar nada: rechazar un secreto/sitio con forma rara (inyección SQL o
    // patrón de reemplazo `$&`/`$$`) — sin imprimir el secreto en ningún caso.
    validarSecretoCron(secreto)
    validarSitioHttps(sitio)

    const ping = await fetch(`https://${sitio}/api/cron/informes-quincenales?ping=1`)
      .then(r => r.json()).catch(() => null) as { ok?: boolean; route?: string } | null
    if (ping?.ok !== true || ping.route !== 'informes-quincenales') {
      throw new Error(`https://${sitio}/api/cron/informes-quincenales?ping=1 no responde con la ruta nueva: el código no está deployado. No se programa nada.`)
    }
    console.log(`deploy verificado en ${sitio}`)

    const sql = reemplazarPlaceholder(
      reemplazarPlaceholder(readFileSync(MIGRACION, 'utf8'), '__SECRETO__', secreto),
      '__SITIO__',
      sitio
    )
    await c.query(sql)

    const { rows: [nuevo] } = await c.query(`SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'informes-quincenales'`)
    const { rows: [clave] } = await c.query(`SELECT (value = $1) AS igual FROM cron_config WHERE key = 'informes_quincenales'`, [secreto])
    console.log('job:', JSON.stringify(nuevo ?? null))
    if (!nuevo || nuevo.active !== true || nuevo.schedule !== '*/2 * 1,2,16,17 * *') throw new Error('el job informes-quincenales no quedó activo con su horario')
    if (clave?.igual !== true) throw new Error('no quedó bien la fila cron_config(informes_quincenales)')
  } finally {
    await c.end()
  }
  console.log('\n✅ job programado. Verificar net._http_response (contenido con "creados") en la próxima corrida del día 1 o 16.')
}

main().catch(e => { console.error('❌', e instanceof Error ? e.message : e); process.exit(1) })
