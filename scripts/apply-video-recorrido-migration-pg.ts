// Aplica 20260728000001_video_recorrido_y_access_tokens.sql conectando directo a Postgres
// vía el session pooler (IPv4). Idempotente.
// Correr: node --env-file=.env.local --import tsx scripts/apply-video-recorrido-migration-pg.ts
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

const password = process.env.SUPABASE_DB_PASSWORD || ''
if (!password) { console.error('Falta SUPABASE_DB_PASSWORD'); process.exit(1) }

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432, // session mode (permite DDL multi-statement)
  database: 'postgres',
  user: 'postgres.mncsnastmcjdjxrehdep',
  password,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

async function main() {
  await client.connect()
  const sql = fs.readFileSync(
    path.resolve('supabase/migrations/20260728000001_video_recorrido_y_access_tokens.sql'), 'utf-8'
  )
  await client.query(sql)

  const columns = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'properties' AND column_name IN ('video_recorrido_url','deliver_media')`
  )
  const table = await client.query(`SELECT to_regclass('public.lead_access_tokens') AS reg`)
  console.log('Columnas properties:', columns.rows.map(r => r.column_name).join(', '))
  console.log('lead_access_tokens:', table.rows[0].reg ?? 'FALTA')
  await client.end()

  if (columns.rows.length !== 2 || !table.rows[0].reg) {
    console.error('❌ Migración incompleta'); process.exit(1)
  }
  console.log('✅ Migración aplicada: properties.video_recorrido_url/deliver_media + lead_access_tokens')
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
