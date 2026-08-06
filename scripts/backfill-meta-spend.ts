/**
 * Recupera la inversión diaria de Meta hacia atrás y VERIFICA la cobertura.
 *
 * La tabla hoy tiene 24 días con dato sobre 88 del rango 2026-03-01..2026-05-27,
 * y nada después: lo que se guardó fue lo que alguien alcanzó a traer al abrir
 * una pantalla, no una serie. Esto la reconstruye.
 *
 * Correr: npx tsx --env-file=.env.local scripts/backfill-meta-spend.ts [desde] [hasta]
 * Default: desde 2026-01-01 hasta hoy.
 */
import { Client } from 'pg'
import { fetchDailyInsightsRange, saveDailySnapshot, checkTokenExpiry } from '../lib/marketing/meta-ads'

function hoyISO(): string { return new Date().toISOString().slice(0, 10) }

async function main() {
  const desde = process.argv[2] ?? '2026-01-01'
  const hasta = process.argv[3] ?? hoyISO()

  // Si el token está vencido, Meta devuelve un error que parece "no hay datos".
  // Cortar acá evita dejar la tabla a medias creyendo que se recuperó todo.
  const diasToken = await checkTokenExpiry().catch(() => null)
  if (diasToken !== null && diasToken <= 0) {
    throw new Error('El token de Meta está vencido. Renovalo antes de recuperar el histórico.')
  }
  console.log(`token: ${diasToken === null ? 'sin información de vencimiento' : `vence en ${diasToken} días`}`)

  console.log(`trayendo ${desde} → ${hasta} …`)
  const filas = await fetchDailyInsightsRange(desde, hasta)
  console.log(`Meta devolvió ${filas.length} filas (campaña × día)`)
  await saveDailySnapshot(filas)

  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const { rows: [cob] } = await c.query(
    `SELECT count(DISTINCT date)::int dias_con_dato,
            ($2::date - $1::date + 1)::int dias_del_rango
       FROM meta_ads_daily WHERE date BETWEEN $1 AND $2`, [desde, hasta])
  const { rows: huecos } = await c.query(
    `SELECT d::date::text dia
       FROM generate_series($1::date, $2::date, '1 day') d
      WHERE NOT EXISTS (SELECT 1 FROM meta_ads_daily m WHERE m.date = d::date)
      ORDER BY d`, [desde, hasta])
  await c.end()

  console.log(`cobertura: ${cob.dias_con_dato} de ${cob.dias_del_rango} días`)
  if (huecos.length > 0) {
    console.log(`días sin dato (${huecos.length}):`)
    console.log('  ' + huecos.map(h => h.dia).join(', '))
    console.log('\nUn día sin dato NO siempre es un error: si ese día no hubo ninguna')
    console.log('campaña activa, Meta no devuelve fila y está bien que falte.')
    console.log('Revisar en Ads Manager si alguno de estos días tuvo campañas corriendo.')
  } else {
    console.log('\n✅ no quedaron días sin dato en el rango')
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
