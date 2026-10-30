/**
 * Programa en pg_cron el publicador de Publicaciones (Instagram + Facebook, cada 2 min).
 *
 * REQUISITO: el código tiene que estar DEPLOYADO. Este script lo verifica solo
 * (`?ping=1`) y no programa nada si la ruta no responde — un job apuntando a un
 * 404 se daría contra la pared cada 2 minutos sin que nadie lo note.
 *
 * El secreto NO se pasa por línea de comandos ni se imprime: se reusa el de
 * `cron_config('send_report')`, el mismo de los reportes, meta-sync y el mapa.
 * El dominio sale del job `meta-sync`, que ya está programado.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-cron-publicaciones-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261030000002_cron_publicaciones.sql'

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
    const { rows: [cfg] } = await c.query(`SELECT value FROM cron_config WHERE key = 'send_report'`)
    const { rows: [job] } = await c.query(
      `SELECT substring(command from 'https://([^/'']+)') AS sitio FROM cron.job WHERE jobname = 'meta-sync'`,
    )
    const secreto: string | undefined = cfg?.value
    const sitio: string | undefined = job?.sitio
    if (!secreto) throw new Error('no está cron_config(send_report)')
    if (!sitio) throw new Error('no pude leer el dominio del job meta-sync')

    const ping = await fetch(`https://${sitio}/api/cron/publicaciones-publicar?ping=1`)
      .then((r) => r.json())
      .catch(() => null) as { ok?: boolean; ruta?: string } | null

    if (ping?.ok !== true || ping.ruta !== 'publicaciones-publicar') {
      throw new Error(
        `https://${sitio}/api/cron/publicaciones-publicar?ping=1 no responde: el código no está deployado. No se programa nada.`,
      )
    }
    console.log(`deploy verificado en ${sitio}`)

    const sql = readFileSync(MIGRACION, 'utf8')
      .replaceAll('__SECRETO__', secreto)
      .replaceAll('__SITIO__', sitio)
    await c.query(sql)

    const { rows: [nuevo] } = await c.query(
      `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'publicaciones-publicar'`,
    )
    const { rows: [clave] } = await c.query(
      `SELECT (value = $1) AS igual FROM cron_config WHERE key = 'publicaciones_publicar'`,
      [secreto],
    )

    console.log('job:', JSON.stringify(nuevo ?? null))
    if (!nuevo || nuevo.active !== true) throw new Error('el job publicaciones-publicar no quedó activo')
    if (clave?.igual !== true) throw new Error('no quedó bien la fila cron_config(publicaciones_publicar)')

    console.log('\n✅ programado. Verificar en unos minutos:')
    console.log("   SELECT status_code, left(content,120), created FROM net._http_response ORDER BY created DESC LIMIT 5;")
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
