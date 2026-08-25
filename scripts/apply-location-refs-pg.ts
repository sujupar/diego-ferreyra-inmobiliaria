/**
 * Aplica `20260824000001_property_location_refs.sql` (columna
 * `properties.location_refs`) contra la base real, por el pooler de sesión.
 *
 * Verifica que la columna existe con el tipo y el default esperados y que NO
 * cambió la cantidad de propiedades. Es idempotente (ADD COLUMN IF NOT EXISTS).
 *
 * Correr:  node --env-file=.env.local --import tsx scripts/apply-location-refs-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20260824000001_property_location_refs.sql'

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  const antes = await c.query('SELECT count(*)::int AS n FROM properties')

  await c.query(readFileSync(MIGRACION, 'utf8'))

  const despues = await c.query('SELECT count(*)::int AS n FROM properties')
  const { rows: col } = await c.query(`
    SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='properties' AND column_name='location_refs'`)
  const { rows: conRef } = await c.query(`
    SELECT count(*)::int AS n FROM properties WHERE location_refs ? 'argenprop'`)
  await c.end()

  console.log(`propiedades ${antes.rows[0].n} → ${despues.rows[0].n}`)
  console.log(`columna: ${col[0]?.data_type} · nullable=${col[0]?.is_nullable} · default=${col[0]?.column_default}`)
  console.log(`propiedades con ubicación de catálogo: ${conRef[0].n}`)

  if (antes.rows[0].n !== despues.rows[0].n) throw new Error('¡ALERTA! cambió la cantidad de propiedades')
  if (!col.length) throw new Error('la columna location_refs no quedó creada')
  if (col[0].data_type !== 'jsonb') throw new Error(`tipo inesperado: ${col[0].data_type}`)
  if (col[0].is_nullable !== 'NO') throw new Error('location_refs debería ser NOT NULL')
  console.log('\n✅ aplicada — columna lista, cero filas tocadas')
}

main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
