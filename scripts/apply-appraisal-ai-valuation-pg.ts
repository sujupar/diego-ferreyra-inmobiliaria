/**
 * Aplica `20260910000001_appraisal_ai_valuation.sql` contra el proyecto de la app
 * (mncsnastmcjdjxrehdep) y VERIFICA: que las 4 columnas existan, que el CHECK
 * rechace un tasador desconocido, y que ninguna fila haya quedado con un tasador
 * distinto de 'calculator' (la migración no debe cambiar ninguna elección).
 *
 * Correr: node --env-file=../../../.env.local --import tsx scripts/apply-appraisal-ai-valuation-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  await c.query(readFileSync('supabase/migrations/20260910000001_appraisal_ai_valuation.sql', 'utf8'))

  const { rows: cols } = await c.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='appraisals'
       AND column_name IN ('ai_valuation_result','ai_valuation_status','ai_valuation_error','valuation_source')`)
  const nombres = cols.map((r: { column_name: string }) => r.column_name).sort()
  console.log('columnas:', nombres.join(', '))
  if (nombres.length !== 4) throw new Error(`faltan columnas: hay ${nombres.length} de 4`)

  // El CHECK se prueba sobre una fila real, dentro de una transacción que se deshace.
  let rechazado = false
  await c.query('BEGIN')
  try {
    await c.query(`UPDATE appraisals SET valuation_source='otro' WHERE id = (SELECT id FROM appraisals LIMIT 1)`)
  } catch { rechazado = true }
  await c.query('ROLLBACK')
  console.log(`tasador desconocido: ${rechazado ? 'RECHAZADO por la base ✓' : 'ACEPTADO ✗'}`)
  if (!rechazado) throw new Error('¡ALERTA! el CHECK de valuation_source no frena valores desconocidos')

  const { rows: n } = await c.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE valuation_source <> 'calculator')::int AS distintas FROM appraisals`)
  await c.end()
  console.log(`tasaciones: ${n[0].total} · con tasador distinto de calculator: ${n[0].distintas}`)
  if (n[0].distintas !== 0) throw new Error('¡ALERTA! alguna fila quedó con valuation_source distinto de calculator')
  console.log('\n✅ aplicada y verificada')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
