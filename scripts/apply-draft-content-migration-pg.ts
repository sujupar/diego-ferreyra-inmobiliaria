/**
 * E1.6 — Aplica la migración draft_content vía session pooler (patrón CLAUDE.md).
 * Verifica que la columna quedó creada en el proyecto de la app (mncsnastmcjdjxrehdep).
 * Correr: node --env-file=.env.local --import tsx scripts/apply-draft-content-migration-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const sql = readFileSync(
    'supabase/migrations/20260724000001_property_landings_draft_content.sql',
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
  const { rows } = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'property_landings' AND column_name = 'draft_content'`,
  )
  console.log('draft_content presente:', rows)
  await client.end()
  if (rows.length !== 1) throw new Error('La columna draft_content NO quedó creada')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
