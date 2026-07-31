/**
 * Aplica la migración de etiquetas + estado del embudo vía session pooler
 * (patrón CLAUDE.md). ADITIVA: no borra ni cambia datos.
 * Correr: node --env-file=.env.local --import tsx scripts/apply-lead-tags-migration-pg.ts
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

  await client.query(readFileSync('supabase/migrations/20260801000001_lead_tags_y_estado.sql', 'utf8'))

  const { rows: leads } = await client.query(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE pipeline_state='nuevo')::int AS nuevos FROM property_leads`,
  )
  const { rows: tags } = await client.query('SELECT label, color FROM lead_tags ORDER BY sort_order')
  console.log(`leads: ${antes[0].n} antes → ${leads[0].n} después (todos en 'nuevo': ${leads[0].nuevos})`)
  console.log(`etiquetas sembradas: ${tags.length}`)
  console.log('  ' + tags.map(t => `${t.label} (${t.color})`).join(' · '))
  await client.end()
  if (antes[0].n !== leads[0].n) throw new Error('¡ALERTA! cambió la cantidad de leads')
  console.log('\n✅ aplicada y verificada — ningún dato tocado')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
