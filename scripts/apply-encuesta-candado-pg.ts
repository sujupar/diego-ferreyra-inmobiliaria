/**
 * Aplica `20261015000003_encuesta_candado_envio.sql` (columna aditiva) y verifica que la columna
 * exista, sea nullable y que ninguna fila de `visit_surveys` haya cambiado. TODO dentro de UNA
 * transacción: si la verificación falla, ROLLBACK.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-encuesta-candado-pg.ts
 * (requiere `pg`: npm i --no-save pg)
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  try {
    const { rows: antes } = await c.query('SELECT count(*)::int AS n FROM visit_surveys')
    await c.query('BEGIN')
    await c.query(readFileSync('supabase/migrations/20261015000003_encuesta_candado_envio.sql', 'utf8'))
    console.log('migración aplicada (sin commitear todavía); verificando…')

    const { rows: col } = await c.query(
      `SELECT is_nullable, data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='visit_surveys' AND column_name='send_lock_until'`)
    ok(col[0], 'la columna send_lock_until existe')
    ok(col[0]?.is_nullable === 'YES', 'send_lock_until es nullable (sin default, no cambia filas existentes)')
    ok(col[0]?.data_type === 'timestamp with time zone', 'send_lock_until es timestamptz')

    const { rows: despues } = await c.query('SELECT count(*)::int AS n FROM visit_surveys')
    ok(antes[0].n === despues[0].n, 'la cantidad de encuestas no cambió')

    const { rows: nulas } = await c.query('SELECT count(*)::int AS n FROM visit_surveys WHERE send_lock_until IS NOT NULL')
    ok(nulas[0].n === 0, 'toda fila existente quedó con send_lock_until en null')

    await c.query('COMMIT')
    console.log('\n✅ aplicada y verificada (COMMIT)')
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await c.end()
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
