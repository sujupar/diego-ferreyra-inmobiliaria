/**
 * Aplica `20260806000008_property_location_insights.sql` (columnas aditivas,
 * no rompe el código deployado) y verifica que la columna quedó consultable.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-location-insights-migration-pg.ts
 * (requiere `pg`: npm i --no-save pg)
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  const { rows: antes } = await c.query('SELECT count(*)::int AS n FROM properties')
  await c.query(readFileSync('supabase/migrations/20260806000008_property_location_insights.sql', 'utf8'))
  const { rows: check } = await c.query(
    "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='properties' AND column_name IN ('location_insights','location_insights_at')",
  )
  const { rows: despues } = await c.query('SELECT count(*)::int AS n FROM properties')
  const { rows: sample } = await c.query('SELECT location_insights FROM properties LIMIT 1')
  await c.end()
  console.log(`propiedades: ${antes[0].n} antes → ${despues[0].n} después`)
  console.log(`columnas nuevas presentes: ${check[0].n}/2`)
  console.log(`select de prueba ok (${sample.length} fila)`)
  if (antes[0].n !== despues[0].n) throw new Error('¡ALERTA! cambió la cantidad de propiedades')
  if (check[0].n !== 2) throw new Error('faltan columnas nuevas')
  console.log('\n✅ migración aplicada y verificada')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
