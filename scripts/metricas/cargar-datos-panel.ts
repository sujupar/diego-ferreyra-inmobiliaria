/**
 * Carga inicial del panel de métricas: las 17 ventas del documento de Diego,
 * los gastos fijos y los cambios conocidos (lib/metrics/panel/datos-iniciales.ts).
 *
 * Idempotente: una venta ya cargada (misma dirección y fecha de reserva), un
 * gasto (mismo concepto) o un hito (misma fecha y título) no se duplica.
 * Uso: node --env-file=.env.local --import tsx scripts/metricas/cargar-datos-panel.ts [--commit]
 * Sin --commit solo muestra lo que haría.
 */
import { Client } from 'pg'
import { GASTOS_INICIALES, HITOS_INICIALES, VENTAS_INICIALES } from '../../lib/metrics/panel/datos-iniciales'
import { calcularVenta } from '../../lib/metrics/panel/reparto'

const commit = process.argv.includes('--commit')

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query('BEGIN')
  let ventas = 0, gastos = 0, hitos = 0
  for (const v of VENTAS_INICIALES) {
    const { rows } = await c.query('SELECT 1 FROM ventas WHERE direccion = $1 AND reservada_en IS NOT DISTINCT FROM $2', [v.direccion, v.reservada_en])
    if (rows.length) continue
    const cols = Object.keys(v) as (keyof typeof v)[]
    await c.query(`INSERT INTO ventas (${cols.join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, cols.map(k => v[k]))
    const k = calcularVenta(v)
    console.log(`  venta  ${v.direccion.padEnd(18)} ${v.reservada_en}  cobrado ${k.cobradoUsd}  limpio ${k.limpioDiegoUsd}`)
    ventas++
  }
  for (const g of GASTOS_INICIALES) {
    const { rows } = await c.query('SELECT 1 FROM gastos_fijos WHERE concepto = $1', [g.concepto])
    if (rows.length) continue
    await c.query('INSERT INTO gastos_fijos (concepto, tipo, monto_usd, desde, hasta, a_confirmar, notas) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [g.concepto, g.tipo, g.monto_usd, g.desde, g.hasta, g.a_confirmar, g.notas])
    gastos++
  }
  for (const h of HITOS_INICIALES) {
    const { rows } = await c.query('SELECT 1 FROM hitos_metricas WHERE fecha = $1 AND titulo = $2', [h.fecha, h.titulo])
    if (rows.length) continue
    await c.query('INSERT INTO hitos_metricas (fecha, embudo, titulo, detalle) VALUES ($1,$2,$3,$4)', [h.fecha, h.embudo, h.titulo, h.detalle])
    hitos++
  }
  const { rows: tot } = await c.query('SELECT count(*)::int n FROM ventas')
  await c.query(commit ? 'COMMIT' : 'ROLLBACK')
  await c.end()
  console.log(`\n${commit ? '✅ cargado' : '(prueba, sin guardar — agregar --commit)'}: ${ventas} ventas, ${gastos} gastos, ${hitos} cambios. Ventas en la tabla: ${tot[0].n}.`)
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
