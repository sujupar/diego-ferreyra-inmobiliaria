/**
 * Aplica `20261126000002_tasks_columnas_cadencia_solo_servidor.sql` (crm-ficha-y-llamadas,
 * design.md D1, hallazgo S1 de la revisión 12.1) y VERIFICA que las columnas
 * `tasks.source_activity_id` y `tasks.closed_by_activity_id` solo las escribe el servidor.
 *
 *   node --env-file=.env.local --import tsx scripts/apply-tasks-cadencia-solo-servidor-pg.ts
 *   node --env-file=.env.local --import tsx scripts/apply-tasks-cadencia-solo-servidor-pg.ts --solo-verificar
 *
 * `--solo-verificar` no ejecuta la migración: sirve para ver fallar la verificación ANTES
 * de aplicarla. La migración es idempotente: correr el script dos veces tiene que terminar
 * igual.
 *
 * Todo lo que el script inserta va dentro de UNA transacción que termina en ROLLBACK (es la
 * base de producción). Cada rechazo esperado va entre SAVEPOINT y ROLLBACK TO SAVEPOINT, y
 * al final se cuentan SOLO las filas de prueba y se aborta si quedó alguna.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261126000002_tasks_columnas_cadencia_solo_servidor.sql'
const NOMBRE_PRUEBA = '[TEST] apply-tasks-cadencia-solo-servidor'
/** Contacto conocido de producción: prueba que la base es la de la app. */
const CONTACTO_CONOCIDO = '7a636d2f-be56-4492-80ed-3bf23ba90e39'
const CLAUDE_QA = 'claude.qa@inmodf.com.ar'
const PERMISO_DENEGADO = '42501'
const TRIGGER = 'trg_tasks_columnas_cadencia_solo_servidor'

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

function codigoDeError(e: unknown): string | null {
  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as { code: unknown }).code
    return typeof code === 'string' ? code : null
  }
  return null
}

function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function main(): Promise<void> {
  const soloVerificar = process.argv.includes('--solo-verificar')
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

  async function comoRol(rol: 'authenticated' | 'service_role', uid: string | null): Promise<void> {
    await c.query(`SET LOCAL ROLE ${rol}`)
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify(uid ? { sub: uid, role: rol } : { role: rol })])
  }

  async function salirDeSesion(): Promise<void> {
    await c.query('RESET ROLE')
    await c.query(`SELECT set_config('request.jwt.claims', '', true)`)
  }

  /** Corre `fn` en un SAVEPOINT y exige que falle con 42501. Siempre vuelve al SAVEPOINT. */
  async function debeFallar(nombre: string, fn: () => Promise<unknown>): Promise<void> {
    await c.query('SAVEPOINT caso')
    let obtenido: string | null = null
    let detalle = ''
    try {
      await fn()
    } catch (e) {
      obtenido = codigoDeError(e)
      detalle = mensajeDeError(e)
    }
    await c.query('ROLLBACK TO SAVEPOINT caso')
    await salirDeSesion()
    if (obtenido !== PERMISO_DENEGADO) {
      throw new Error(`¡ALERTA! ${nombre}: se esperaba el error ${PERMISO_DENEGADO} y vino ${obtenido ?? 'ninguno'} ${detalle}`)
    }
    console.log(`✓ rechazado (${PERMISO_DENEGADO}): ${nombre}`)
  }

  /** Corre `fn` y exige que pase, con `filas` filas afectadas. */
  async function debePasar(nombre: string, filas: number, fn: () => Promise<{ rowCount: number | null }>): Promise<void> {
    const r = await fn()
    await salirDeSesion()
    ok((r.rowCount ?? 0) === filas, `pasa (${r.rowCount} fila/s): ${nombre}`)
  }

  async function contarFilasDePrueba(): Promise<{ contactos: number; tareas: number }> {
    const contactos = await uno<{ n: number }>(`SELECT count(*)::int AS n FROM contacts WHERE full_name = $1`, [NOMBRE_PRUEBA])
    const tareas = await uno<{ n: number }>(`SELECT count(*)::int AS n FROM tasks WHERE title LIKE $1`, [`${NOMBRE_PRUEBA}%`])
    return { contactos: contactos.n, tareas: tareas.n }
  }

  // ── La base es la de la app ────────────────────────────────────────────────────────────
  const conocido = await c.query(`SELECT id FROM contacts WHERE id = $1`, [CONTACTO_CONOCIDO])
  ok(conocido.rows.length === 1, `contacto conocido presente (proyecto mncsnastmcjdjxrehdep)`)
  const antes = await contarFilasDePrueba()
  ok(antes.contactos === 0 && antes.tareas === 0, `no hay filas de prueba de una corrida anterior (${JSON.stringify(antes)})`)

  if (soloVerificar) {
    console.log('· --solo-verificar: no se ejecuta la migración')
  } else {
    await c.query(readFileSync(MIGRACION, 'utf8'))
    console.log(`✓ migración ejecutada: ${MIGRACION}`)
  }

  const trig = await c.query<{ tgname: string; d: string }>(
    `SELECT tgname, pg_get_triggerdef(oid) AS d FROM pg_trigger
      WHERE tgrelid = 'public.tasks'::regclass AND tgname = $1`, [TRIGGER])
  const hayTrigger = trig.rows.length === 1 && /BEFORE INSERT OR UPDATE/.test(trig.rows[0].d)
  // Con --solo-verificar se sigue igual, para ver fallar el comportamiento y no solo la estructura.
  if (soloVerificar && !hayTrigger) console.log(`· falta el trigger ${TRIGGER}`)
  else ok(hayTrigger, `trigger ${TRIGGER} BEFORE INSERT OR UPDATE`)
  const policies = await c.query<{ policyname: string }>(
    `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks' ORDER BY 1`)
  ok(policies.rows.length === 4, `las 4 policies de tasks siguen igual (${policies.rows.map((p) => p.policyname).join(', ')})`)

  const claude = await uno<{ id: string }>(`SELECT id FROM profiles WHERE email = $1`, [CLAUDE_QA])

  await c.query('BEGIN')
  try {
    const contacto = await uno<{ id: string }>(`INSERT INTO contacts (full_name) VALUES ($1) RETURNING id`, [NOMBRE_PRUEBA])
    const act1 = await uno<{ id: string }>(
      `INSERT INTO contact_activities (contact_id, kind, body) VALUES ($1, 'note', '[TEST] 1') RETURNING id`, [contacto.id])
    const act2 = await uno<{ id: string }>(
      `INSERT INTO contact_activities (contact_id, kind, body) VALUES ($1, 'note', '[TEST] 2') RETURNING id`, [contacto.id])
    // Conexión directa sin JWT (scripts de mantenimiento): pasa.
    const tarea = await uno<{ id: string }>(
      `INSERT INTO tasks (type, title, assigned_to, contact_id, source_activity_id)
       VALUES ('follow_up', $1, $2, $3, $4) RETURNING id`,
      [`${NOMBRE_PRUEBA} cadencia`, claude.id, contacto.id, act1.id])
    console.log('✓ pasa: conexión directa sin JWT inserta con source_activity_id')

    // ── Sesión de usuario (authenticated): lo que tiene que rebotar ─────────────────────
    await debeFallar('authenticated inserta con source_activity_id', async () => {
      await comoRol('authenticated', claude.id)
      await c.query(`INSERT INTO tasks (type, title, assigned_to, source_activity_id) VALUES ('follow_up', $1, $2, $3)`,
        [`${NOMBRE_PRUEBA} intruso`, claude.id, act2.id])
    })
    await debeFallar('authenticated inserta con closed_by_activity_id', async () => {
      await comoRol('authenticated', claude.id)
      await c.query(`INSERT INTO tasks (type, title, assigned_to, closed_by_activity_id) VALUES ('follow_up', $1, $2, $3)`,
        [`${NOMBRE_PRUEBA} intruso`, claude.id, act2.id])
    })
    await debeFallar('authenticated cambia source_activity_id de su tarea', async () => {
      await comoRol('authenticated', claude.id)
      await c.query(`UPDATE tasks SET source_activity_id = $1 WHERE id = $2`, [act2.id, tarea.id])
    })
    await debeFallar('authenticated pone closed_by_activity_id en su tarea', async () => {
      await comoRol('authenticated', claude.id)
      await c.query(`UPDATE tasks SET closed_by_activity_id = $1 WHERE id = $2`, [act2.id, tarea.id])
    })
    await debeFallar('authenticated borra source_activity_id de su tarea', async () => {
      await comoRol('authenticated', claude.id)
      await c.query(`UPDATE tasks SET source_activity_id = NULL WHERE id = $1`, [tarea.id])
    })

    // ── Sesión de usuario: lo de siempre sigue pasando ──────────────────────────────────
    await debePasar('authenticated inserta una tarea sin esas columnas', 1, async () => {
      await comoRol('authenticated', claude.id)
      return c.query(`INSERT INTO tasks (type, title, assigned_to) VALUES ('follow_up', $1, $2)`,
        [`${NOMBRE_PRUEBA} normal`, claude.id])
    })
    await debePasar('authenticated completa su tarea de la cadencia sin tocar esas columnas', 1, async () => {
      await comoRol('authenticated', claude.id)
      return c.query(`UPDATE tasks SET status = 'completed', completed_at = now(), title = title WHERE id = $1`, [tarea.id])
    })
    const sigue = await uno<{ s: string | null }>(`SELECT source_activity_id::text AS s FROM tasks WHERE id = $1`, [tarea.id])
    ok(sigue.s === act1.id, 'la tarea conserva su source_activity_id')

    // ── service_role: pasa ──────────────────────────────────────────────────────────────
    await debePasar('service_role inserta con source_activity_id', 1, async () => {
      await comoRol('service_role', null)
      return c.query(`INSERT INTO tasks (type, title, assigned_to, source_activity_id) VALUES ('follow_up', $1, $2, $3)`,
        [`${NOMBRE_PRUEBA} servidor`, claude.id, act2.id])
    })
    await debePasar('service_role pone closed_by_activity_id', 1, async () => {
      await comoRol('service_role', null)
      return c.query(`UPDATE tasks SET closed_by_activity_id = $1 WHERE id = $2`, [act2.id, tarea.id])
    })

    // ── La acción de la FK (SET NULL) con el JWT de un usuario: pasa ────────────────────
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: claude.id, role: 'authenticated' })])
    await c.query(`DELETE FROM contact_activities WHERE id = $1`, [act1.id])
    await salirDeSesion()
    const suelta = await uno<{ s: string | null }>(`SELECT source_activity_id::text AS s FROM tasks WHERE id = $1`, [tarea.id])
    ok(suelta.s === null, 'borrar la actividad con JWT de usuario suelta la tarea (FK SET NULL anidada)')
  } finally {
    await c.query('ROLLBACK')
    console.log('· ROLLBACK de todo lo insertado')
  }

  const final = await contarFilasDePrueba()
  ok(final.contactos === 0 && final.tareas === 0, `no quedó ninguna fila de prueba (${JSON.stringify(final)})`)
  await c.end()
  console.log(soloVerificar ? '\n✅ verificada' : '\n✅ aplicada y verificada')
}

main().catch((e: unknown) => {
  console.error('Error:', mensajeDeError(e))
  process.exit(1)
})
