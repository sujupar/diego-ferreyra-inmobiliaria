/**
 * Aplica `20261127000001_crm_cartera.sql` (crm-cartera-por-rol, design.md D2) y VERIFICA las
 * seis cosas de D2. Aborta con `throw` ante la primera que no cuadre.
 *
 *   npm i --no-save pg
 *   node --env-file=.env.local --import tsx scripts/apply-crm-cartera-pg.ts
 *
 * La migración es idempotente: el script la ejecuta DOS veces seguidas (y correr el script
 * dos veces tiene que terminar igual). Como re-ejecuta el archivo ENTERO, un arreglo
 * posterior de la función se hace también en el archivo (si no, volver a correr esto lo
 * revierte).
 *
 * Todo lo que el script INSERTA va dentro de UNA transacción que termina en ROLLBACK: es la
 * base de producción. Al final se cuentan SOLO las filas de prueba (no los totales: mientras
 * corre puede entrar un lead real) y se aborta si quedó alguna.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261127000001_crm_cartera.sql'
const NOMBRE_PRUEBA = '[TEST] apply-crm-cartera'
const NOMBRE_SIN_NADA = '[TEST] apply-crm-cartera sin nada'
/** Contacto conocido de producción (el primero que se cargó): prueba que la base es la de la app. */
const CONTACTO_CONOCIDO = '7a636d2f-be56-4492-80ed-3bf23ba90e39'
const FIRMA = 'public.crm_ultimos_contactos(uuid[])'
/** D2: una llamada con 900 ids tiene que terminar por debajo de esto. */
const TOPE_MS = 50

interface FilaFuncion {
  contacto_id: string
  actividad_at: string | null
  actividad_tipo: string | null
  actividad_resultado: string | null
  visita_at: string | null
}

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Diferencia en ms entre dos instantes; NaN si alguno no se entiende. */
function diferenciaMs(a: string | null, b: string | null): number {
  if (!a || !b) return Number.NaN
  return Math.abs(Date.parse(a) - Date.parse(b))
}

async function main(): Promise<void> {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD en el entorno')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  async function uno<R>(sql: string, valores?: unknown[]): Promise<R> {
    const r = await c.query<R>(sql, valores)
    if (r.rows.length !== 1) throw new Error(`se esperaba 1 fila y vinieron ${r.rows.length}: ${sql.slice(0, 80)}`)
    return r.rows[0]
  }

  async function contarFilasDePrueba(): Promise<{ contactos: number; procesos: number; actividades: number }> {
    const nombres = [NOMBRE_PRUEBA, NOMBRE_SIN_NADA]
    const contactos = await uno<{ n: number }>(
      `SELECT count(*)::int AS n FROM contacts WHERE full_name = ANY($1::text[])`, [nombres])
    const procesos = await uno<{ n: number }>(
      `SELECT count(*)::int AS n FROM deals d
        WHERE d.property_address = ANY($1::text[])
           OR d.contact_id IN (SELECT id FROM contacts WHERE full_name = ANY($1::text[]))`, [nombres])
    const actividades = await uno<{ n: number }>(
      `SELECT count(*)::int AS n FROM contact_activities
        WHERE contact_id IN (SELECT id FROM contacts WHERE full_name = ANY($1::text[]))`, [nombres])
    return { contactos: contactos.n, procesos: procesos.n, actividades: actividades.n }
  }
  const sinFilas = (f: { contactos: number; procesos: number; actividades: number }) =>
    f.contactos === 0 && f.procesos === 0 && f.actividades === 0

  // ── La base es la de la app ────────────────────────────────────────────────────────────
  const conocido = await c.query(`SELECT id FROM contacts WHERE id = $1`, [CONTACTO_CONOCIDO])
  ok(conocido.rows.length === 1, `contacto conocido ${CONTACTO_CONOCIDO} presente (proyecto mncsnastmcjdjxrehdep)`)
  const tabla = await uno<{ t: string | null }>(`SELECT to_regclass('public.contact_activities')::text AS t`)
  ok(tabla.t !== null, 'contact_activities existe (la función la lee)')

  const antes = await contarFilasDePrueba()
  console.log(`filas de prueba antes: ${JSON.stringify(antes)}`)
  ok(sinFilas(antes), 'no hay filas de prueba de una corrida anterior')

  // ── Aplicar el archivo entero, dos veces seguidas (idempotente) ────────────────────────
  const sql = readFileSync(MIGRACION, 'utf8')
  await c.query(sql)
  console.log(`✓ migración ejecutada (1/2): ${MIGRACION}`)
  await c.query(sql)
  console.log(`✓ migración ejecutada (2/2): ${MIGRACION}`)

  // ── 1. La función existe y NO es SECURITY DEFINER ──────────────────────────────────────
  const fn = await c.query<{ prosecdef: boolean; provolatile: string }>(
    `SELECT prosecdef, provolatile FROM pg_proc
      WHERE oid = to_regprocedure($1)`, [FIRMA])
  ok(fn.rows.length === 1, 'la función crm_ultimos_contactos(uuid[]) existe (una sola)')
  ok(fn.rows[0].prosecdef === false, 'la función es SECURITY INVOKER (prosecdef = false)')
  ok(fn.rows[0].provolatile === 's', 'la función es STABLE')

  // ── 2. Privilegios ─────────────────────────────────────────────────────────────────────
  const priv = await uno<{ anon: boolean; auth: boolean; servicio: boolean }>(
    `SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
            has_function_privilege('authenticated', $1, 'EXECUTE') AS auth,
            has_function_privilege('service_role', $1, 'EXECUTE') AS servicio`, [FIRMA])
  ok(priv.anon === false, 'anon NO puede ejecutarla')
  ok(priv.auth === false, 'authenticated NO puede ejecutarla')
  ok(priv.servicio === true, 'service_role SÍ puede ejecutarla')

  // ── 3. Índice ──────────────────────────────────────────────────────────────────────────
  const idx = await c.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='idx_deals_contact_id'`)
  ok(idx.rows.length === 1 && /\(contact_id\)/.test(idx.rows[0].indexdef),
    `idx_deals_contact_id existe sobre deals(contact_id): ${idx.rows[0]?.indexdef ?? '—'}`)

  // ── Desde acá, todo dentro de una transacción que termina en ROLLBACK ──────────────────
  await c.query('BEGIN')
  try {
    const contacto = await uno<{ id: string }>(
      `INSERT INTO contacts (full_name) VALUES ($1) RETURNING id`, [NOMBRE_PRUEBA])
    const sinNada = await uno<{ id: string }>(
      `INSERT INTO contacts (full_name) VALUES ($1) RETURNING id`, [NOMBRE_SIN_NADA])
    const visitado = await uno<{ id: string; visited_at: string }>(
      `INSERT INTO deals (contact_id, property_address, stage, visited_at)
       VALUES ($1, $2, 'followup', now() - interval '10 days') RETURNING id, visited_at::text`,
      [contacto.id, NOMBRE_PRUEBA])
    const otro = await uno<{ id: string }>(
      `INSERT INTO deals (contact_id, property_address, stage) VALUES ($1, $2, 'request') RETURNING id`,
      [contacto.id, NOMBRE_PRUEBA])
    // Una nota de hoy (no cuenta), una llamada ANULADA de hoy (no cuenta), la llamada de ayer
    // (la que tiene que ganar) y un WhatsApp de hace 2 días (más viejo).
    await c.query(
      `INSERT INTO contact_activities (contact_id, kind, body) VALUES ($1, 'note', '[TEST] nota de hoy')`,
      [contacto.id])
    await c.query(
      `INSERT INTO contact_activities (contact_id, deal_id, kind, call_outcome, voided_at)
       VALUES ($1, $2, 'call', 'agendo', now())`, [contacto.id, otro.id])
    const ayer = await uno<{ occurred_at: string }>(
      `INSERT INTO contact_activities (contact_id, deal_id, kind, call_outcome, occurred_at)
       VALUES ($1, $2, 'call', 'no_atendio', now() - interval '1 day') RETURNING occurred_at::text`,
      [contacto.id, otro.id])
    await c.query(
      `INSERT INTO contact_activities (contact_id, deal_id, kind, occurred_at)
       VALUES ($1, $2, 'whatsapp_sent', now() - interval '2 days')`, [contacto.id, visitado.id])

    // ── 4. El caso de prueba ─────────────────────────────────────────────────────────────
    const r = await c.query<FilaFuncion>(
      `SELECT contacto_id::text, actividad_at::text, actividad_tipo, actividad_resultado, visita_at::text
         FROM public.crm_ultimos_contactos($1::uuid[])`,
      // El mismo id dos veces: la función tiene que devolver una sola fila por persona.
      [[contacto.id, contacto.id, sinNada.id]])
    ok(r.rows.length === 1, `una sola fila para las dos personas de prueba (vinieron ${r.rows.length})`)
    const f = r.rows[0]
    ok(f.contacto_id === contacto.id, 'la fila es la del contacto con actividad')
    ok(f.actividad_tipo === 'call' && f.actividad_resultado === 'no_atendio',
      `gana la llamada de ayer, no la nota ni la anulada (${f.actividad_tipo} · ${f.actividad_resultado})`)
    ok(diferenciaMs(f.actividad_at, ayer.occurred_at) < 1000, `actividad_at = la de ayer (${f.actividad_at})`)
    ok(diferenciaMs(f.visita_at, visitado.visited_at) < 1000, `visita_at = la visita de hace 10 días (${f.visita_at})`)

    // ── 5. Un contacto sin nada no devuelve fila ─────────────────────────────────────────
    const vacio = await c.query(`SELECT 1 FROM public.crm_ultimos_contactos($1::uuid[])`, [[sinNada.id]])
    ok(vacio.rows.length === 0, 'un contacto sin llamadas, WhatsApp ni visitas no devuelve fila')
    const nadie = await c.query(`SELECT 1 FROM public.crm_ultimos_contactos($1::uuid[])`, [[]])
    ok(nadie.rows.length === 0, 'una lista vacía no devuelve filas')

    // ── 6. Tiempo con 900 ids ────────────────────────────────────────────────────────────
    const ids = await c.query<{ id: string }>(`SELECT id::text FROM contacts ORDER BY created_at DESC LIMIT 900`)
    ok(ids.rows.length >= 800, `hay ${ids.rows.length} contactos para medir`)
    const plan = await uno<{ 'QUERY PLAN': { 'Execution Time': number }[] }>(
      `EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM public.crm_ultimos_contactos($1::uuid[])`,
      [ids.rows.map((x) => x.id)])
    const ms = plan['QUERY PLAN'][0]['Execution Time']
    ok(ms < TOPE_MS, `EXPLAIN ANALYZE con ${ids.rows.length} ids: ${ms.toFixed(2)} ms (< ${TOPE_MS} ms)`)
  } finally {
    await c.query('ROLLBACK')
    console.log('· ROLLBACK de todo lo insertado')
  }

  const despues = await contarFilasDePrueba()
  console.log(`filas de prueba después: ${JSON.stringify(despues)}`)
  ok(sinFilas(despues), 'no quedó ninguna fila de prueba')

  await c.end()
  console.log('\n✅ aplicada y verificada')
}

main().catch((e: unknown) => {
  console.error('Error:', mensajeDeError(e))
  process.exit(1)
})
