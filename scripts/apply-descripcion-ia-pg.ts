/**
 * Aplica `20260919000001_property_descripcion_ia.sql` (columna aditiva, no rompe
 * el código deployado) y verifica que quedó consultable.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-descripcion-ia-pg.ts
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
  await c.query(readFileSync('supabase/migrations/20260919000001_property_descripcion_ia.sql', 'utf8'))
  const { rows: check } = await c.query(
    "SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='properties' AND column_name='descripcion_ia'",
  )
  const { rows: despues } = await c.query('SELECT count(*)::int AS n FROM properties')
  const { rows: conDato } = await c.query('SELECT count(*)::int AS n FROM properties WHERE descripcion_ia IS NOT NULL')
  await c.end()
  console.log(`propiedades: ${antes[0].n} antes → ${despues[0].n} después`)
  console.log(`columna descripcion_ia: ${check[0]?.data_type ?? 'NO EXISTE'}`)
  console.log(`filas con dato: ${conDato[0].n}`)
  if (antes[0].n !== despues[0].n) throw new Error('¡ALERTA! cambió la cantidad de propiedades')
  if (check[0]?.data_type !== 'jsonb') throw new Error('la columna no quedó como jsonb')
  console.log('\n✅ migración aplicada y verificada')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
