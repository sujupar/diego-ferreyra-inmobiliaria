/**
 * Aplica `20261024000001_informe_ciclo.sql` y VERIFICA en UNA transacción: si algo no cuadra, ROLLBACK y
 * código 1. Las escrituras de prueba van en SAVEPOINT y se deshacen. Idempotente.
 *
 *   node --env-file=../../../.env.local --import tsx scripts/apply-informe-ciclo-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    await c.query("SET lock_timeout = '5s'")
    const antes = Number((await c.query(`SELECT count(*) n FROM public.tasks`)).rows[0].n)
    await c.query('BEGIN')
    await c.query(readFileSync('supabase/migrations/20261024000001_informe_ciclo.sql', 'utf8'))
    console.log('migración aplicada (sin commitear todavía); verificando…')

    const chk = (await c.query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname='tasks_type_check'`)).rows[0]?.d ?? ''
    for (const t of ['update_contact', 'new_assignment', 'review_property', 'rejected_docs', 'complete_imported_property', 'follow_up', 'informe_quincenal']) {
      ok(chk.includes(`'${t}'`), `el CHECK acepta ${t}`)
    }
    ok(Number((await c.query(`SELECT count(*) n FROM public.tasks`)).rows[0].n) === antes, `las ${antes} tareas siguen ahí`)

    const col = (await c.query(`SELECT data_type FROM information_schema.columns WHERE table_name='property_reports' AND column_name='avisado_at'`)).rows
    ok(col.length === 1 && col[0].data_type.startsWith('timestamp'), 'columna avisado_at existe')
    const idx = (await c.query(`SELECT 1 FROM pg_indexes WHERE indexname='idx_property_reports_ciclo'`)).rows
    ok(idx.length === 1, 'índice del ciclo existe')

    const perfil = (await c.query(`SELECT id FROM public.profiles WHERE role='coordinador' AND is_active LIMIT 1`)).rows[0]?.id
    const prop = (await c.query(`SELECT id FROM public.properties WHERE title LIKE '[TEST%' LIMIT 1`)).rows[0]?.id
    await c.query('SAVEPOINT prueba')
    await c.query(`INSERT INTO public.tasks (type, title, assigned_to, property_id) VALUES ('informe_quincenal', '[TEST] prueba del CHECK', $1, $2)`, [perfil, prop])
    ok(true, 'una tarea informe_quincenal se inserta')
    let rechazo = false
    try {
      await c.query('SAVEPOINT malo')
      await c.query(`INSERT INTO public.tasks (type, title, assigned_to, property_id) VALUES ('informe_quincenal', '[TEST] duplicada', $1, $2)`, [perfil, prop])
    } catch { rechazo = true; await c.query('ROLLBACK TO SAVEPOINT malo') }
    ok(rechazo, 'una segunda tarea pendiente del mismo tipo y propiedad se rechaza (índice único)')
    await c.query('ROLLBACK TO SAVEPOINT prueba')

    await c.query('COMMIT')
    console.log('COMMIT hecho.')
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  } finally {
    await c.end()
  }
}
main()
