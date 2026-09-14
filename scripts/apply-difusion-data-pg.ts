/**
 * Aplica `20260914000001_property_difusion_data.sql` y VERIFICA:
 *  - que las dos columnas existan en `properties` del proyecto correcto,
 *  - que el default sea '{}' (una propiedad vieja tiene que leerse como "sin datos",
 *    no como null: el código hace `property.portal_data.ml ?? {}`),
 *  - que ninguna fila quedó con null.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/apply-difusion-data-pg.ts
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
  await c.query(readFileSync('supabase/migrations/20260914000001_property_difusion_data.sql', 'utf8'))

  for (const col of ['portal_data', 'landing_answers']) {
    const { rows } = await c.query(
      `SELECT data_type, column_default, is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='properties' AND column_name=$1`, [col])
    if (rows.length === 0) throw new Error(`falta properties.${col}`)
    console.log(`properties.${col}: ${rows[0].data_type}, default ${rows[0].column_default}, nullable ${rows[0].is_nullable} ✓`)
    if (rows[0].is_nullable !== 'NO') throw new Error(`${col} tiene que ser NOT NULL`)
    const { rows: nulos } = await c.query(`SELECT count(*)::int AS n FROM properties WHERE ${col} IS NULL`)
    if (nulos[0].n !== 0) throw new Error(`${col}: ${nulos[0].n} filas en null`)
  }
  const { rows: total } = await c.query(`SELECT count(*)::int AS n FROM properties`)
  console.log(`${total[0].n} propiedades, todas con portal_data/landing_answers = '{}' ✓`)
  await c.end()
}

main().catch(e => { console.error(e); process.exit(1) })
