/**
 * Aplica `20261029000001_consultas_unificadas.sql` (vista nueva, aditiva) y la
 * verifica DENTRO de una transacción: si la cantidad de filas de la vista no es
 * exactamente consultas de portal + consultas de landing válidas, o si la vista
 * no quedó con `security_invoker=true`, hace ROLLBACK y sale con error.
 *
 * Por qué `security_invoker`: sin eso, la vista correría con los permisos de su
 * dueño (postgres) y un usuario logueado leería TODAS las consultas por la API
 * REST, salteando la RLS por rol de las dos tablas de origen.
 *
 * Modos:
 *   (sin args)        aplica + verifica
 *   --columnas        solo imprime las columnas reales de las tablas de origen
 *   --verificar-api   lee 1 fila de la vista con el cliente service role (API)
 *
 * Uso: node --env-file=../../../.env.local --import tsx scripts/apply-consultas-unificadas-pg.ts [modo]
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'

const MIGRACION = 'supabase/migrations/20261029000001_consultas_unificadas.sql'

function cliente(): Client {
  return new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
}

async function columnas() {
  const c = cliente()
  await c.connect()
  const { rows } = await c.query<{ table_name: string; column_name: string; data_type: string }>(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('portal_inquiries','property_leads','properties')
        AND (table_name <> 'properties' OR column_name IN ('id','assigned_to'))
      ORDER BY table_name, ordinal_position`,
  )
  await c.end()
  for (const r of rows) console.log(`${r.table_name.padEnd(18)} ${r.column_name.padEnd(26)} ${r.data_type}`)
}

async function aplicar() {
  const c = cliente()
  await c.connect()
  try {
    await c.query('BEGIN')
    await c.query(readFileSync(MIGRACION, 'utf8'))

    const { rows: [n] } = await c.query<{ vista: number; portal: number; landing: number }>(`
      SELECT
        (SELECT count(*)::int FROM public.consultas_unificadas) AS vista,
        (SELECT count(*)::int FROM public.portal_inquiries) AS portal,
        (SELECT count(*)::int FROM public.property_leads
          WHERE source = 'landing' AND deleted_at IS NULL AND suspected_bot IS NOT TRUE) AS landing`)
    const { rows: [opc] } = await c.query<{ reloptions: string[] | null }>(
      `SELECT reloptions FROM pg_class WHERE oid = 'public.consultas_unificadas'::regclass`)
    const { rows: porTipo } = await c.query<{ tipo: string; canal: string; n: number }>(
      `SELECT tipo, canal, count(*)::int AS n FROM public.consultas_unificadas GROUP BY 1,2 ORDER BY 1,2`)
    const { rows: permisos } = await c.query<{ grantee: string }>(
      `SELECT grantee FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='consultas_unificadas' AND privilege_type='SELECT'
        ORDER BY grantee`)

    console.log(`vista: ${n.vista} filas | portal_inquiries: ${n.portal} | landing válidas: ${n.landing}`)
    console.log(`reloptions: ${JSON.stringify(opc.reloptions)}`)
    for (const r of porTipo) console.log(`  ${r.tipo.padEnd(8)} ${r.canal.padEnd(10)} ${r.n}`)
    console.log(`SELECT para: ${permisos.map((p) => p.grantee).join(', ')}`)

    if (n.vista !== n.portal + n.landing) throw new Error(`la vista tiene ${n.vista} filas, se esperaban ${n.portal + n.landing}`)
    if (!(opc.reloptions ?? []).includes('security_invoker=true')) throw new Error('la vista no quedó con security_invoker=true')
    if (permisos.some((p) => p.grantee === 'anon')) throw new Error('anon puede leer la vista')

    await c.query('COMMIT')
    console.log('\n✅ aplicada y verificada (COMMIT)')
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  } finally {
    await c.end()
  }
}

async function verificarApi() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(url, clave, { auth: { persistSession: false } })
  const { data, error } = await sb.from('consultas_unificadas').select('id, tipo, canal, portal, recibida_at').limit(1)
  if (error) throw new Error(`la API respondió error: ${error.message}`)
  console.log(`API: ${data.length} fila(s) →`, JSON.stringify(data))
  if (data.length !== 1) throw new Error('se esperaba 1 fila')
  console.log('✅ la vista se lee por la API')
}

const modo = process.argv[2]
const tarea = modo === '--columnas' ? columnas : modo === '--verificar-api' ? verificarApi : aplicar
tarea().catch((e: unknown) => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
