/**
 * Aplica `20260903000001_landing_ab_test.sql` y VERIFICA lo que importa:
 *  - que el experimento nazca APAGADO (encenderlo es una decisión de la pantalla,
 *    no un efecto de correr una migración sobre tráfico pago vivo),
 *  - que los CHECK rechacen de verdad una variante inventada y un reparto fuera
 *    de rango — si no, el panel puede escribir basura y la landing la sirve,
 *  - que la RPC de resultados devuelva SIEMPRE las dos filas (A y B), incluso
 *    sin datos, porque el panel las pinta lado a lado.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  await c.query(readFileSync('supabase/migrations/20260903000001_landing_ab_test.sql', 'utf8'))

  // 1) La fila del experimento existe y está apagada.
  const { rows: exp } = await c.query(
    `SELECT status, split_b, winner FROM landing_experiments WHERE funnel='tasacion'`)
  if (exp.length === 0) throw new Error('no se creó la fila del experimento de tasacion')
  console.log(`experimento tasacion: status=${exp[0].status} split_b=${exp[0].split_b} winner=${exp[0].winner ?? 'null'}`)
  if (exp[0].status !== 'off') throw new Error('¡ALERTA! el experimento NO nació apagado')

  // 2) Las columnas de variante existen en las dos tablas.
  for (const t of ['deals', 'landing_page_visits']) {
    const { rows } = await c.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name='landing_variant'`, [t])
    if (rows.length === 0) throw new Error(`falta ${t}.landing_variant`)
    console.log(`${t}.landing_variant: existe ✓`)
  }

  // 3) El CHECK frena una variante inventada. Esta es la prueba que vale.
  let rechazoVariante = false
  try {
    await c.query(`UPDATE deals SET landing_variant='Z' WHERE id=(SELECT id FROM deals LIMIT 1)`)
  } catch { rechazoVariante = true }
  console.log(`variante inventada: ${rechazoVariante ? 'RECHAZADA por la base ✓' : 'ACEPTADA ✗'}`)
  if (!rechazoVariante) throw new Error('¡ALERTA! el CHECK de landing_variant no frena valores inválidos')

  // 4) El CHECK frena un reparto imposible.
  let rechazoSplit = false
  try {
    await c.query(`UPDATE landing_experiments SET split_b=150 WHERE funnel='tasacion'`)
  } catch { rechazoSplit = true }
  console.log(`reparto 150%: ${rechazoSplit ? 'RECHAZADO por la base ✓' : 'ACEPTADO ✗'}`)
  if (!rechazoSplit) throw new Error('¡ALERTA! el CHECK de split_b no frena valores fuera de rango')

  // 5) La RPC devuelve las dos variantes aunque no haya un solo dato todavía.
  const { rows: res } = await c.query(
    `SELECT * FROM get_landing_ab_results('tasacion', current_date - 30, current_date)`)
  console.log(`RPC de resultados: ${res.length} filas → ${res.map(r => `${r.variante}:${r.visitas}v/${r.conversiones}c`).join('  ')}`)
  if (res.length !== 2) throw new Error('la RPC tiene que devolver siempre A y B')

  // 6) Nada histórico quedó marcado por accidente.
  const { rows: hist } = await c.query(
    `SELECT count(*)::int AS n FROM deals WHERE landing_variant IS NOT NULL`)
  console.log(`deals con variante asignada: ${hist[0].n} (debe ser 0 recién aplicada)`)
  if (hist[0].n !== 0) throw new Error('¡ALERTA! hay deals marcados con variante antes de empezar el test')

  await c.end()
  console.log('\n✅ aplicada y verificada — el experimento queda APAGADO hasta que se encienda desde /embudos')
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1) })
