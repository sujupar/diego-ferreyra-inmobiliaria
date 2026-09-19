/**
 * Aplica `20260919000002_deals_property_id_idx.sql` (índice aditivo) y verifica
 * que exista y que la consulta de la ficha lo use.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-deals-property-idx-pg.ts
 * (requiere `pg`: npm i --no-save pg)
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  const { rows: antes } = await c.query('SELECT count(*)::int AS n FROM deals')
  await c.query(readFileSync('supabase/migrations/20260919000002_deals_property_id_idx.sql', 'utf8'))
  const { rows: idx } = await c.query(
    "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='deals' AND indexname='idx_deals_property_id'")
  // Con pocas filas Postgres puede preferir recorrer la tabla aunque el índice
  // exista: se apaga el recorrido secuencial SOLO en esta sesión para confirmar
  // que el índice es utilizable por la consulta real de la ficha.
  await c.query('SET enable_seqscan = off')
  const { rows: plan } = await c.query(
    "EXPLAIN SELECT visit_data, updated_at FROM deals WHERE property_id = 'fff05c7f-e7ea-413c-ad33-062dc7bf0a10' ORDER BY updated_at DESC LIMIT 5")
  const { rows: despues } = await c.query('SELECT count(*)::int AS n FROM deals')
  await c.end()
  const textoPlan = plan.map(r => r['QUERY PLAN']).join('\n')
  console.log(`procesos: ${antes[0].n} antes → ${despues[0].n} después`)
  console.log(`índice: ${idx[0]?.indexdef ?? 'NO EXISTE'}`)
  console.log(`plan:\n${textoPlan}`)
  if (antes[0].n !== despues[0].n) throw new Error('¡ALERTA! cambió la cantidad de procesos')
  if (!idx[0]) throw new Error('el índice no quedó creado')
  if (!textoPlan.includes('idx_deals_property_id')) throw new Error('la consulta de la ficha no usa el índice')
  console.log('\n✅ índice aplicado y verificado')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
