/**
 * Aplica las migraciones de número de comprador + vista del listado, vía session
 * pooler (patrón CLAUDE.md). Ambas son ADITIVAS: no borran ni cambian datos.
 * Correr: node --env-file=.env.local --import tsx scripts/apply-lead-number-migration-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  const { rows: antes } = await client.query('SELECT count(*)::int AS n FROM property_leads')

  for (const f of [
    'supabase/migrations/20260731000001_lead_number_y_antibot.sql',
    'supabase/migrations/20260731000002_vw_properties_list.sql',
  ]) {
    await client.query(readFileSync(f, 'utf8'))
    console.log(`✅ ${f}`)
  }

  const { rows: despues } = await client.query(
    'SELECT count(*)::int AS n, count(lead_number)::int AS numerados, min(lead_number) AS min, max(lead_number) AS max FROM property_leads',
  )
  const { rows: vista } = await client.query('SELECT count(*)::int AS n FROM vw_properties_list')
  const { rows: pesado } = await client.query(
    `SELECT count(*)::int AS n FROM properties WHERE photos IS NOT NULL AND array_length(photos,1) > 0 AND photos[1] LIKE 'data:%'`,
  )

  console.log(`\nleads: ${antes[0].n} antes → ${despues[0].n} después (ninguno se pierde)`)
  console.log(`numerados: ${despues[0].numerados}/${despues[0].n}  rango #${despues[0].min}–#${despues[0].max}`)
  console.log(`vw_properties_list: ${vista[0].n} filas`)
  console.log(`propiedades con portada base64 legacy (thumbnail NULL en la vista): ${pesado[0].n}`)
  await client.end()

  if (antes[0].n !== despues[0].n) throw new Error('¡ALERTA! cambió la cantidad de leads')
  if (despues[0].numerados !== despues[0].n) throw new Error('quedaron leads sin número')
  console.log('\n✅ aplicadas y verificadas — ningún dato tocado')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
