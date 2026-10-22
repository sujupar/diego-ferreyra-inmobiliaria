/**
 * Aplica `20261022000001_informes_quincenales.sql` y VERIFICA, todo en UNA transacción: si algo no
 * cuadra, ROLLBACK y código 1. Las escrituras de prueba van en SAVEPOINT y se deshacen.
 * Idempotente: se puede volver a correr para verificar.
 *
 *   node --env-file=../../../.env.local --import tsx scripts/apply-informes-pg.ts
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

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    await c.query("SET lock_timeout = '5s'")
    await c.query('BEGIN')
    await c.query(readFileSync('supabase/migrations/20261022000001_informes_quincenales.sql', 'utf8'))
    console.log('migración aplicada (sin commitear todavía); verificando…')

    const t = (await c.query(`SELECT relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname='property_reports'`)).rows
    ok(t.length === 1 && t[0].relrowsecurity === true, 'property_reports existe y tiene RLS')

    const prop = (await c.query(`SELECT id FROM public.properties LIMIT 1`)).rows[0]?.id
    ok(!!prop, 'hay al menos una propiedad para probar')
    const INS = `INSERT INTO public.property_reports (property_id, desde, hasta, origen) VALUES ($1,$2,$3,$4)`
    await c.query('SAVEPOINT bueno')
    await c.query(INS, [prop, '2026-10-01', '2026-10-15', 'ciclo'])
    ok(true, 'acepta un informe válido')
    ok(await rechaza(c, 'dup', INS, [prop, '2026-10-01', '2026-10-15', 'manual']), 'rechaza el mismo período dos veces (UNIQUE)')
    await c.query('ROLLBACK TO SAVEPOINT bueno')

    ok(await rechaza(c, 'r1', INS, [prop, '2026-10-15', '2026-10-01', 'manual']), 'rechaza hasta < desde')
    ok(await rechaza(c, 'r2', INS, [prop, '2026-01-01', '2026-10-01', 'manual']), 'rechaza más de 120 días')
    ok(await rechaza(c, 'r3', INS, [prop, '2026-10-01', '2026-10-15', 'otro']), 'rechaza un origen desconocido')
    ok(await rechaza(c, 'r4', `INSERT INTO public.property_reports (property_id, desde, hasta, origen, estado) VALUES ($1,'2026-10-01','2026-10-15','manual','listo')`, [prop]),
      'rechaza "listo" sin PDF ni fecha')
    ok(await rechaza(c, 'r5', `INSERT INTO public.property_reports (property_id, desde, hasta, origen, pdf_path) VALUES ($1,'2026-10-01','2026-10-15','manual','otra/cosa.pdf')`, [prop]),
      'rechaza un path de PDF fuera de informes/')
    ok(await rechaza(c, 'r6', `INSERT INTO public.property_reports (property_id, desde, hasta, origen, competidoras) VALUES ($1,'2026-10-01','2026-10-15','manual','{}'::jsonb)`, [prop]),
      'competidoras tiene que ser una lista')

    const pol = (await c.query(`SELECT polname FROM pg_policy WHERE polrelid='public.property_reports'::regclass`)).rows
    ok(pol.length === 1 && pol[0].polname === 'property_reports_select_scoped', 'una sola policy: lectura por rol')
    const grants = (await c.query(`SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='property_reports' AND grantee='authenticated'`)).rows
    ok(grants.length === 1 && grants[0].privilege_type === 'SELECT', 'authenticated solo puede SELECT')
    const b = (await c.query(`SELECT public, file_size_limit FROM storage.buckets WHERE id='property-reports'`)).rows
    ok(b.length === 1 && b[0].public === false && Number(b[0].file_size_limit) === 20971520, 'bucket property-reports privado, 20 MB')

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
