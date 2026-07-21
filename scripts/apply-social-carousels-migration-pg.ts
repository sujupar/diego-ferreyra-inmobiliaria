// Aplica 20260721000001_social_carousels.sql conectando directo a Postgres
// vía el session pooler (IPv4). Idempotente.
// Correr: node --env-file=.env.local --import tsx scripts/apply-social-carousels-migration-pg.ts
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
    path.resolve('supabase/migrations/20260721000001_social_carousels.sql'), 'utf-8'
  )
  await client.query(sql)

  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('social_carousels','social_carousel_slides')
     ORDER BY table_name`
  )
  const bucket = await client.query(
    `SELECT id FROM storage.buckets WHERE id = 'social-carousels'`
  )
  const policies = await client.query(
    `SELECT COUNT(*)::int AS n FROM pg_policies
     WHERE tablename IN ('social_carousels','social_carousel_slides')`
  )
  console.log('Tablas:', tables.rows.map(r => r.table_name).join(', '))
  console.log('Bucket:', bucket.rows.length ? 'social-carousels ✓' : 'FALTA')
  console.log('Policies:', policies.rows[0].n)
  await client.end()

  if (tables.rows.length !== 2 || bucket.rows.length !== 1) {
    console.error('❌ Migración incompleta'); process.exit(1)
  }
  console.log('✅ Migración aplicada: social_carousels + social_carousel_slides + bucket')
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
