/**
 * Aplica la migración de tablas Mailchimp vía session pooler (patrón CLAUDE.md).
 * ADITIVA: no borra ni cambia datos existentes.
 * Correr: node --env-file=.env.local --import tsx scripts/apply-mailchimp-sync-migration-pg.ts
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
  const { rows: dealsBefore } = await client.query('SELECT count(*)::int AS n FROM deals')

  await client.query(readFileSync('supabase/migrations/20260803000010_mailchimp_sync.sql', 'utf8'))

  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public'
       AND table_name IN ('mailchimp_sync_state','mailchimp_sync_log','mailchimp_suppressions')
     ORDER BY table_name`,
  )
  const { rows: dealsAfter } = await client.query('SELECT count(*)::int AS n FROM deals')
  await client.end()

  console.log('tablas creadas:', tables.map(t => t.table_name).join(', '))
  if (tables.length !== 3) throw new Error(`Esperaba 3 tablas, hay ${tables.length}`)
  if (dealsBefore[0].n !== dealsAfter[0].n) throw new Error('¡ALERTA! cambió la cantidad de deals')
  console.log(`deals: ${dealsBefore[0].n} antes → ${dealsAfter[0].n} después (sin cambios)`)
  console.log('\n✅ aplicada y verificada — ningún dato tocado')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
