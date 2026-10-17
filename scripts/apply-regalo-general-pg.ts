/**
 * Aplica `20261017000001_regalo_general_encuesta.sql` y VERIFICA, todo dentro de UNA transacción:
 * si algo no cuadra, ROLLBACK y código 1. Las pruebas que escriben corren en SAVEPOINT y se deshacen.
 * Idempotente (CREATE IF NOT EXISTS / DROP POLICY IF EXISTS): se puede volver a correr para verificar.
 *
 *   node --env-file=../../../.env.local --import tsx scripts/apply-regalo-general-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

async function rechaza(c: Client, nombre: string, sql: string, params: unknown[]): Promise<boolean> {
  await c.query(`SAVEPOINT ${nombre}`)
  try {
    await c.query(sql, params)
    await c.query(`ROLLBACK TO SAVEPOINT ${nombre}`)
    return false
  } catch {
    await c.query(`ROLLBACK TO SAVEPOINT ${nombre}`)
    return true
  }
}

const U = '11111111-1111-4111-8111-111111111111'

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    await c.query("SET lock_timeout = '5s'")
    await c.query('BEGIN')
    await c.query(readFileSync('supabase/migrations/20261017000001_regalo_general_encuesta.sql', 'utf8'))
    console.log('migración aplicada (sin commitear todavía); verificando…')

    const t = (await c.query(`SELECT relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname='visit_survey_general_gift'`)).rows
    ok(t.length === 1 && t[0].relrowsecurity === true, 'visit_survey_general_gift existe y tiene RLS')

    const INS = `INSERT INTO public.visit_survey_general_gift (title, file_path, file_name, file_size, cover_path) VALUES ($1,$2,$3,$4,$5)`
    await c.query('SAVEPOINT bueno')
    await c.query(INS, ['Guía de gastos', `general/regalo-${U}.pdf`, 'guia.pdf', 1000, `general/portada-${U}.jpg`])
    ok(true, 'acepta una fila con paths válidos')
    ok(await rechaza(c, 'segunda', INS.replace('(title', '(id, title').replace('($1', '(false, $1'), ['X X', `general/regalo-${U}.pdf`, 'g.pdf', 1, null]), 'rechaza una segunda fila (id distinto de true)')
    await c.query('ROLLBACK TO SAVEPOINT bueno')

    ok(await rechaza(c, 'p1', INS, ['Guía', `properties/${U}/regalo-${U}.pdf`, 'g.pdf', 1, null]), 'rechaza un path de propiedad')
    ok(await rechaza(c, 'p2', INS, ['Guía', `general/regalo-${U}.pdf/../x`, 'g.pdf', 1, null]), 'rechaza un recorrido de carpeta')
    ok(await rechaza(c, 'p3', INS, ['Guía', `general/regalo-${U}.pdf`, 'g.pdf', 1, `general/portada-${U}.gif`]), 'rechaza una portada GIF')
    ok(await rechaza(c, 'p4', INS, ['Guía', `general/regalo-${U}.pdf`, 'g.pdf', 21 * 1024 * 1024, null]), 'rechaza más de 20 MB')

    const pol = (await c.query(`SELECT polname FROM pg_policy WHERE polrelid='public.visit_survey_general_gift'::regclass`)).rows
    ok(pol.length === 1 && pol[0].polname === 'visit_survey_general_gift_select_ops', 'una sola policy: lectura de operaciones')
    const grants = (await c.query(`SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='visit_survey_general_gift' AND grantee='authenticated'`)).rows
    ok(grants.length === 1 && grants[0].privilege_type === 'SELECT', 'authenticated solo puede SELECT')

    await c.query('COMMIT')
    console.log('COMMIT ✓')
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  } finally {
    await c.end()
  }
}
main()
