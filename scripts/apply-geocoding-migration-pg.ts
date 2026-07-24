// Aplica 20260723000001_property_geocoding.sql conectando directo a Postgres
// vía el session pooler (IPv4) — la Management API no tiene token válido y
// la conexión directa es IPv6-only. Idempotente.
// Correr: node --env-file=.env.local --import tsx scripts/apply-geocoding-migration-pg.ts
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
    path.resolve('supabase/migrations/20260723000001_property_geocoding.sql'), 'utf-8'
  )
  await client.query(sql)
  const check = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'properties' AND column_name IN ('province', 'geo_confidence', 'geocoded_at')
     ORDER BY column_name`
  )
  console.log('Verificación:', JSON.stringify(check.rows))
  await client.end()
  if (check.rows.length !== 3) { console.error('❌ Faltan columnas'); process.exit(1) }
  console.log('✅ Migración aplicada: properties.province / geo_confidence / geocoded_at existen')
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
