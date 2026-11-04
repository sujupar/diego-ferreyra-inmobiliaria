/**
 * Aplica la migración del destino personalizado de los reels y la verifica. Idempotente.
 * Correr: node --env-file=.env.local --import tsx scripts/apply-reels-destino-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261104000012_reels_destino_personalizado.sql'

function exigir(condicion: unknown, mensaje: string): void {
  if (!condicion) throw new Error(mensaje)
  console.log(`✓ ${mensaje}`)
}

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD (está en .env.local)')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  try {
    await c.query(readFileSync(MIGRACION, 'utf8'))
    const { rows: col } = await c.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='property_reels' AND column_name IN ('property_id','enlace_destino')`,
    )
    const m = new Map(col.map((r) => [r.column_name as string, r.is_nullable as string]))
    exigir(m.get('property_id') === 'YES', 'property_id acepta vacío')
    exigir(m.has('enlace_destino'), 'existe enlace_destino')
    const { rows: chk } = await c.query(
      `SELECT conname FROM pg_constraint WHERE conname IN ('property_reels_enlace_destino_check','property_reels_propiedad_o_destino_check')`,
    )
    exigir(chk.length === 2, 'existen los dos CHECK')
    const { rows: sin } = await c.query(`SELECT count(*)::int AS n FROM public.property_reels WHERE property_id IS NULL`)
    exigir(sin[0].n === 0, 'ningún reel existente quedó sin propiedad')
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
