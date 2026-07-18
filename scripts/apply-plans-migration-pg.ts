// Aplica 20260718000001_property_plans.sql conectando directo a Postgres
// vía el session pooler (IPv4) — la Management API no tiene token válido y
// la conexión directa es IPv6-only. Idempotente.
// Correr: node --env-file=.env.local --import tsx scripts/apply-plans-migration-pg.ts
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
    path.resolve('supabase/migrations/20260718000001_property_plans.sql'), 'utf-8'
  )
  await client.query(sql)
  const check = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'properties' AND column_name = 'plans'`
  )
  console.log('Verificación:', JSON.stringify(check.rows))
  await client.end()
  if (check.rows.length !== 1) { console.error('❌ La columna no aparece'); process.exit(1) }
  console.log('✅ Migración aplicada: properties.plans existe')
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
