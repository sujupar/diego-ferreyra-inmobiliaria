/**
 * Aplica la migración de mensajes de WhatsApp + papelera de leads vía session
 * pooler (patrón CLAUDE.md). La migración es ADITIVA: no borra ni cambia datos.
 * Correr: node --env-file=.env.local --import tsx scripts/apply-whatsapp-messages-migration-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const sql = readFileSync(
    'supabase/migrations/20260730000001_whatsapp_messages_y_leads_papelera.sql',
    'utf8',
  )
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  await client.query(sql)

  const { rows: tabla } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'whatsapp_messages' ORDER BY ordinal_position`,
  )
  const { rows: col } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'property_leads' AND column_name = 'deleted_at'`,
  )
  const { rows: pol } = await client.query(
    `SELECT policyname FROM pg_policies WHERE tablename = 'whatsapp_messages'`,
  )
  // Confirmación de que NO se perdió ningún lead con la migración.
  const { rows: cnt } = await client.query(
    `SELECT count(*)::int AS total, count(deleted_at)::int AS borrados FROM property_leads`,
  )

  console.log(`whatsapp_messages: ${tabla.length} columnas → ${tabla.map(r => r.column_name).join(', ')}`)
  console.log(`property_leads.deleted_at presente: ${col.length === 1}`)
  console.log(`políticas RLS: ${pol.map(r => r.policyname).join(', ') || '(ninguna)'}`)
  console.log(`leads: ${cnt[0].total} en total, ${cnt[0].borrados} marcados como borrados`)
  await client.end()

  if (tabla.length === 0) throw new Error('whatsapp_messages NO se creó')
  if (col.length !== 1) throw new Error('property_leads.deleted_at NO se creó')
  if (cnt[0].borrados !== 0) throw new Error('¡ALERTA! la migración marcó leads como borrados')
  console.log('\n✅ migración aplicada y verificada — ningún dato tocado')
}

main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
