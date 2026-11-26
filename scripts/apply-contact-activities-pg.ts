/**
 * Aplica `20261125000001_contact_activities.sql` (crm-ficha-y-llamadas, design.md D1) y
 * VERIFICA las 8 cosas de D1. Aborta con `throw` ante la primera que no cuadre.
 *
 *   npm i --no-save pg
 *   node --env-file=.env.local --import tsx scripts/apply-contact-activities-pg.ts
 *
 * La migración es idempotente: correr el script dos veces seguidas tiene que terminar igual.
 * Como re-ejecuta el archivo ENTERO, un arreglo posterior de un CHECK o de la policy se hace
 * también en el archivo de la migración (si no, volver a correr esto lo revierte).
 *
 * Todo lo que el script INSERTA va dentro de UNA transacción que termina en ROLLBACK: es la
 * base de producción. Los rechazos esperados van cada uno entre SAVEPOINT y ROLLBACK TO
 * SAVEPOINT (un error deja la transacción abortada y lo siguiente fallaría con 25P02), y
 * después de cada sesión simulada se hace RESET ROLE. Al final se cuentan SOLO las filas de
 * prueba (no los totales: mientras corre puede entrar un lead real) y se aborta si quedó alguna.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261125000001_contact_activities.sql'
const NOMBRE_PRUEBA = '[TEST] apply-contact-activities'
/** Contacto conocido de producción (el primero que se cargó): prueba que la base es la de la app. */
const CONTACTO_CONOCIDO = '7a636d2f-be56-4492-80ed-3bf23ba90e39'
/** Cuentas de prueba del dueño (@passmail.com) y la de Claude: nunca personas reales. */
const COORDINADOR_PRUEBA = 'inmobiliariadiegofer.deem471@passmail.com'
const ASESOR_PRUEBA = 'inmobiliariadiegofer.kick529@passmail.com'
const ABOGADO_PRUEBA = 'inmobiliariadiegofer.marbles738@passmail.com'
const CLAUDE_QA = 'claude.qa@inmodf.com.ar'

const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const PERMISO_DENEGADO = '42501'

const COLUMNAS = [
  'id', 'contact_id', 'deal_id', 'kind', 'call_outcome', 'body', 'occurred_at', 'callback_at',
  'created_by', 'created_at', 'updated_at', 'voided_at', 'voided_by', 'client_token', 'automatic',
]
const CHECKS = [
  'contact_activities_kind_check',
  'contact_activities_outcome_check',
  'contact_activities_outcome_solo_llamadas_check',
  'contact_activities_nota_con_texto_check',
  'contact_activities_body_largo_check',
  'contact_activities_ocurrio_check',
  'contact_activities_editada_solo_nota_check',
  'contact_activities_callback_check',
]
const INDICES_TABLA = [
  'idx_contact_activities_contacto',
  'idx_contact_activities_intentos',
  'uq_contact_activities_client_token',
]
const INDICES_TASKS = [
  'uq_tasks_source_activity',
  'idx_tasks_closed_by_activity',
  'idx_tasks_deal_pendientes',
  'idx_tasks_contact_pendientes',
]

/** Columnas NOT NULL sin default que este script sabe completar, por tabla. */
const OBLIGATORIAS_CONOCIDAS: Record<string, string[]> = {
  contacts: ['full_name'],
  deals: ['property_address'],
  tasks: ['type', 'title'],
}

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

  /** Corre `fn` en un SAVEPOINT y exige que falle con `codigo`. Siempre vuelve al SAVEPOINT. */
  async function debeFallar(nombre: string, codigo: string, fn: () => Promise<unknown>): Promise<void> {
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
    await c.query('RESET ROLE')
    if (obtenido !== codigo) {
      throw new Error(`¡ALERTA! ${nombre}: se esperaba el error ${codigo} y vino ${obtenido ?? 'ninguno'} ${detalle}`)
    }
    console.log(`✓ rechazado (${codigo}): ${nombre}`)
  }

  /** Entra a una sesión simulada de `uid` (rol `authenticated`), dentro de la transacción. */
  async function comoUsuario(uid: string): Promise<void> {
    await c.query('SET LOCAL ROLE authenticated')
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid, role: 'authenticated' })])
  }

  async function salirDeSesion(): Promise<void> {
    await c.query('RESET ROLE')
    await c.query(`SELECT set_config('request.jwt.claims', '', true)`)
  }

  async function contarFilasDePrueba(): Promise<{ contactos: number; procesos: number; actividades: number; tareas: number }> {
    const hayTabla = await uno<{ t: string | null }>(`SELECT to_regclass('public.contact_activities')::text AS t`)
    const contactos = await uno<{ n: number }>(
      `SELECT count(*)::int AS n FROM contacts WHERE full_name = $1`, [NOMBRE_PRUEBA])
    const procesos = await uno<{ n: number }>(
      `SELECT count(*)::int AS n FROM deals d
        WHERE d.property_address = $1
           OR d.contact_id IN (SELECT id FROM contacts WHERE full_name = $1)`, [NOMBRE_PRUEBA])
    const tareas = await uno<{ n: number }>(
      `SELECT count(*)::int AS n FROM tasks WHERE title = $1`, [NOMBRE_PRUEBA])
    let actividades = 0
    if (hayTabla.t) {
      const a = await uno<{ n: number }>(
        `SELECT count(*)::int AS n FROM contact_activities
          WHERE contact_id IN (SELECT id FROM contacts WHERE full_name = $1)`, [NOMBRE_PRUEBA])
      actividades = a.n
    }
    return { contactos: contactos.n, procesos: procesos.n, actividades, tareas: tareas.n }
  }

  function sinFilas(f: { contactos: number; procesos: number; actividades: number; tareas: number }): boolean {
    return f.contactos === 0 && f.procesos === 0 && f.actividades === 0 && f.tareas === 0
  }

  // ── 1. La base es la de la app ─────────────────────────────────────────────────────────
  const db = await uno<{ db: string }>(`SELECT current_database() AS db`)
  ok(db.db === 'postgres', `base: ${db.db}`)
  const conocido = await c.query(`SELECT id FROM contacts WHERE id = $1`, [CONTACTO_CONOCIDO])
  ok(conocido.rows.length === 1, `contacto conocido ${CONTACTO_CONOCIDO} presente (proyecto mncsnastmcjdjxrehdep)`)

  // La policy nombra estas columnas de `appraisals`: si falta alguna, no se aplica nada.
  const colsTasacion = await c.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='appraisals'
        AND column_name IN ('contact_id','assigned_to','user_id')`)
  ok(colsTasacion.rows.length === 3, 'appraisals tiene contact_id, assigned_to y user_id')

  const antes = await contarFilasDePrueba()
  console.log(`filas de prueba antes: ${JSON.stringify(antes)}`)
  ok(sinFilas(antes), 'no hay filas de prueba de una corrida anterior')

  // ── Aplicar el archivo entero ──────────────────────────────────────────────────────────
  await c.query(readFileSync(MIGRACION, 'utf8'))
  console.log(`✓ migración ejecutada: ${MIGRACION}`)

  // ── 2. Estructura ──────────────────────────────────────────────────────────────────────
  const cols = await c.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='contact_activities'`)
  const nombres = cols.rows.map((r) => r.column_name).sort()
  ok(nombres.length === 15 && COLUMNAS.every((n) => nombres.includes(n)),
    `contact_activities con sus 15 columnas (${nombres.length})`)

  const checks = await c.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.contact_activities'::regclass AND contype = 'c'`)
  const nombresCheck = checks.rows.map((r) => r.conname)
  ok(nombresCheck.length === 8 && CHECKS.every((n) => nombresCheck.includes(n)),
    `los 8 CHECK (${nombresCheck.length})`)

  const idx = await c.query<{ indexname: string; tablename: string }>(
    `SELECT indexname, tablename FROM pg_indexes
      WHERE schemaname='public' AND indexname = ANY($1::text[])`, [[...INDICES_TABLA, ...INDICES_TASKS]])
  const idxTabla = idx.rows.filter((r) => r.tablename === 'contact_activities').map((r) => r.indexname)
  const idxTasks = idx.rows.filter((r) => r.tablename === 'tasks').map((r) => r.indexname)
  ok(INDICES_TABLA.every((n) => idxTabla.includes(n)), 'los 3 índices de contact_activities')
  ok(INDICES_TASKS.every((n) => idxTasks.includes(n)), 'los 4 índices de tasks')

  const rls = await uno<{ rls: boolean }>(
    `SELECT relrowsecurity AS rls FROM pg_class WHERE oid = 'public.contact_activities'::regclass`)
  ok(rls.rls === true, 'RLS activa en contact_activities')
  const policies = await c.query<{ policyname: string; cmd: string }>(
    `SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='contact_activities'`)
  ok(policies.rows.length === 1 && policies.rows[0].cmd === 'SELECT'
    && policies.rows[0].policyname === 'contact_activities_select',
  `una sola policy, la de SELECT (${policies.rows.map((p) => `${p.policyname}:${p.cmd}`).join(', ')})`)

  // ── 3. tasks: columnas nuevas, obligatorias y created_at con default ───────────────────
  const colsTasks = await c.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='tasks'
        AND column_name IN ('source_activity_id','closed_by_activity_id')`)
  ok(colsTasks.rows.length === 2, 'tasks tiene source_activity_id y closed_by_activity_id')

  const obligatorias = await c.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('tasks','deals','contacts')
        AND is_nullable='NO' AND column_default IS NULL`)
  for (const r of obligatorias.rows) {
    const conocidas = OBLIGATORIAS_CONOCIDAS[r.table_name] ?? []
    if (!conocidas.includes(r.column_name)) {
      throw new Error(`¡ALERTA! ${r.table_name}.${r.column_name} es obligatoria y el script no sabe completarla`)
    }
  }
  console.log(`✓ obligatorias sin default: ${obligatorias.rows.map((r) => `${r.table_name}.${r.column_name}`).join(', ')}`)

  const defCreated = await uno<{ d: string | null }>(
    `SELECT column_default AS d FROM information_schema.columns
      WHERE table_schema='public' AND table_name='tasks' AND column_name='created_at'`)
  ok(defCreated.d !== null, `tasks.created_at tiene valor por defecto (${defCreated.d})`)

  const roles = await uno<{ r: string[] }>(`SELECT enum_range(NULL::app_role)::text[] AS r`)
  const rolFuera = roles.r.includes('viewer') ? 'viewer' : roles.r.includes('agent') ? 'agent' : null

  const perfil = async (email: string): Promise<string> => {
    const p = await uno<{ id: string }>(`SELECT id FROM profiles WHERE email = $1`, [email])
    return p.id
  }
  const coordinador = await perfil(COORDINADOR_PRUEBA)
  const asesor = await perfil(ASESOR_PRUEBA)
  const abogado = await perfil(ABOGADO_PRUEBA)
  const claude = await perfil(CLAUDE_QA)
  const rolesPrueba = await c.query<{ email: string; role: string }>(
    `SELECT email, role::text AS role FROM profiles WHERE id = ANY($1::uuid[])`, [[coordinador, asesor, abogado]])
  const rolDe = (email: string) => rolesPrueba.rows.find((r) => r.email === email)?.role
  ok(rolDe(COORDINADOR_PRUEBA) === 'coordinador' && rolDe(ASESOR_PRUEBA) === 'asesor'
    && rolDe(ABOGADO_PRUEBA) === 'abogado', 'cuentas de prueba con su rol (coordinador, asesor, abogado)')

  // ── Desde acá, todo dentro de una transacción que termina en ROLLBACK ──────────────────
  await c.query('BEGIN')
  try {
    const contacto = await uno<{ id: string }>(
      `INSERT INTO contacts (full_name) VALUES ($1) RETURNING id`, [NOMBRE_PRUEBA])
    const proceso = await uno<{ id: string }>(
      `INSERT INTO deals (contact_id, property_address, stage) VALUES ($1, $2, 'request') RETURNING id`,
      [contacto.id, NOMBRE_PRUEBA])

    // ── 4. Lo que tiene que entrar ───────────────────────────────────────────────────────
    const nota = await uno<{ id: string; automatic: boolean }>(
      `INSERT INTO contact_activities (contact_id, kind, body) VALUES ($1, 'note', '[TEST] nota')
       RETURNING id, automatic`, [contacto.id])
    ok(nota.automatic === false, 'nota sin nombrar `automatic` → automatic = false')
    const llamada = await uno<{ id: string }>(
      `INSERT INTO contact_activities (contact_id, deal_id, kind, call_outcome)
       VALUES ($1, $2, 'call', 'no_atendio') RETURNING id`, [contacto.id, proceso.id])
    console.log('✓ entra: llamada no_atendio')
    await uno(`INSERT INTO contact_activities (contact_id, deal_id, kind, call_outcome, callback_at)
       VALUES ($1, $2, 'call', 'volver_a_llamar', now() + interval '1 day') RETURNING id`, [contacto.id, proceso.id])
    console.log('✓ entra: volver_a_llamar con callback_at')
    await uno(`INSERT INTO contact_activities (contact_id, deal_id, kind) VALUES ($1, $2, 'whatsapp_sent') RETURNING id`,
      [contacto.id, proceso.id])
    console.log('✓ entra: whatsapp_sent')
    const auto = await uno<{ automatic: boolean }>(
      `INSERT INTO contact_activities (contact_id, kind, body, automatic)
       VALUES ($1, 'note', '[TEST] nota automática', true) RETURNING automatic`, [contacto.id])
    ok(auto.automatic === true, 'entra: nota con automatic = true')

    // ── 5. Lo que tiene que rebotar (23514) ──────────────────────────────────────────────
    const insertar = (columnas: string, valores: string) => () =>
      c.query(`INSERT INTO contact_activities (contact_id, ${columnas}) VALUES ($1, ${valores})`, [contacto.id])
    await debeFallar('llamada sin resultado', CHECK_VIOLATION, insertar('kind', `'call'`))
    await debeFallar('nota con resultado', CHECK_VIOLATION, insertar('kind, body, call_outcome', `'note', 'x', 'no_atendio'`))
    await debeFallar('nota vacía', CHECK_VIOLATION, insertar('kind, body', `'note', '   '`))
    await debeFallar('kind desconocido', CHECK_VIOLATION, insertar('kind, body', `'email', 'x'`))
    await debeFallar('resultado desconocido', CHECK_VIOLATION, insertar('kind, call_outcome', `'call', 'ocupado'`))
    await debeFallar('occurred_at un día en el futuro', CHECK_VIOLATION,
      insertar('kind, body, occurred_at', `'note', 'x', now() + interval '1 day'`))
    await debeFallar('occurred_at de hace 8 días', CHECK_VIOLATION,
      insertar('kind, body, occurred_at', `'note', 'x', now() - interval '8 days'`))
    await debeFallar('texto de 2.001 caracteres', CHECK_VIOLATION,
      insertar('kind, body', `'note', repeat('a', 2001)`))
    await debeFallar('volver_a_llamar sin callback_at', CHECK_VIOLATION,
      insertar('kind, call_outcome', `'call', 'volver_a_llamar'`))
    await debeFallar('no_atendio con callback_at', CHECK_VIOLATION,
      insertar('kind, call_outcome, callback_at', `'call', 'no_atendio', now() + interval '1 day'`))
    await debeFallar('nota con callback_at', CHECK_VIOLATION,
      insertar('kind, body, callback_at', `'note', 'x', now() + interval '1 day'`))

    // ── 6. Únicos (23505) y created_at de la tarea ───────────────────────────────────────
    const token = await uno<{ t: string }>(`SELECT gen_random_uuid()::text AS t`)
    await uno(`INSERT INTO contact_activities (contact_id, kind, body, client_token)
       VALUES ($1, 'note', '[TEST] con token', $2) RETURNING id`, [contacto.id, token.t])
    await debeFallar('segundo insert con el mismo client_token', UNIQUE_VIOLATION,
      () => c.query(`INSERT INTO contact_activities (contact_id, kind, body, client_token)
         VALUES ($1, 'note', '[TEST] repetido', $2)`, [contacto.id, token.t]))

    const tarea = await uno<{ id: string; created_at: string | null }>(
      `INSERT INTO tasks (type, title, deal_id, source_activity_id)
       VALUES ('follow_up', $1, $2, $3) RETURNING id, created_at`, [NOMBRE_PRUEBA, proceso.id, llamada.id])
    ok(tarea.created_at !== null, 'la tarea de prueba, insertada sin created_at, queda con created_at cargado')
    await debeFallar('dos tareas con el mismo source_activity_id', UNIQUE_VIOLATION,
      () => c.query(`INSERT INTO tasks (type, title, deal_id, source_activity_id)
         VALUES ('follow_up', $1, $2, $3)`, [NOMBRE_PRUEBA, proceso.id, llamada.id]))

    // ── 7. RLS con sesión simulada ───────────────────────────────────────────────────────
    const leer = async (uid: string): Promise<number> => {
      await comoUsuario(uid)
      const r = await uno<{ n: number }>(
        `SELECT count(*)::int AS n FROM contact_activities WHERE contact_id = $1`, [contacto.id])
      await salirDeSesion()
      return r.n
    }
    const totalFilas = await uno<{ n: number }>(
      `SELECT count(*)::int AS n FROM contact_activities WHERE contact_id = $1`, [contacto.id])

    ok(await leer(coordinador) === totalFilas.n, `coordinador lee las ${totalFilas.n} filas de prueba`)
    ok(await leer(asesor) === 0, 'asesor sin vínculo con el contacto lee 0 filas')

    await c.query(`UPDATE contacts SET assigned_to = $1 WHERE id = $2`, [asesor, contacto.id])
    ok(await leer(asesor) === totalFilas.n, 'asesor con el contacto asignado lee las filas')
    await c.query(`UPDATE contacts SET assigned_to = NULL WHERE id = $1`, [contacto.id])

    await c.query(`UPDATE deals SET assigned_to = $1 WHERE id = $2`, [asesor, proceso.id])
    ok(await leer(asesor) === totalFilas.n, 'asesor con solo un proceso del contacto lee las filas')
    await c.query(`UPDATE deals SET assigned_to = NULL WHERE id = $1`, [proceso.id])
    ok(await leer(asesor) === 0, 'asesor sin vínculo vuelve a leer 0 filas')

    ok(await leer(abogado) === 0, 'abogado lee 0 filas')

    if (rolFuera) {
      // Dentro de la transacción: el ROLLBACK le devuelve a "Claude · pruebas" su rol.
      await c.query(`UPDATE profiles SET role = $1::app_role WHERE id = $2`, [rolFuera, claude])
      await c.query(`UPDATE contacts SET assigned_to = $1 WHERE id = $2`, [claude, contacto.id])
      ok(await leer(claude) === 0, `rol fuera de la lista (${rolFuera}) con el contacto asignado lee 0 filas`)
      await c.query(`UPDATE contacts SET assigned_to = NULL WHERE id = $1`, [contacto.id])
    } else {
      console.log('· no hay rol fuera de la lista (viewer/agent) en app_role para probar: se sigue')
    }

    // Escritura con sesión propia: INSERT rechazado (42501) para los tres.
    for (const [quien, uid] of [['coordinador', coordinador], ['asesor', asesor], ['abogado', abogado]] as const) {
      await debeFallar(`INSERT con sesión de ${quien}`, PERMISO_DENEGADO, async () => {
        await comoUsuario(uid)
        await c.query(`INSERT INTO contact_activities (contact_id, kind, body) VALUES ($1, 'note', '[TEST] intruso')`,
          [contacto.id])
      })
    }

    const original = await uno<Record<string, unknown>>(
      `SELECT call_outcome, body, occurred_at::text, voided_at::text FROM contact_activities WHERE id = $1`, [llamada.id])

    /** UPDATE/DELETE con sesión propia: vale 0 filas afectadas o 42501. Nunca cambia la fila. */
    const escrituraRechazada = async (nombre: string, sql: string): Promise<void> => {
      await c.query('SAVEPOINT caso')
      let resultado: string
      try {
        await comoUsuario(coordinador)
        const r = await c.query(sql, [llamada.id])
        if ((r.rowCount ?? 0) !== 0) {
          await c.query('ROLLBACK TO SAVEPOINT caso')
          await c.query('RESET ROLE')
          throw new Error(`¡ALERTA! ${nombre} con sesión propia afectó ${r.rowCount} filas`)
        }
        resultado = '0 filas'
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('¡ALERTA!')) throw e
        const codigo = codigoDeError(e)
        await c.query('ROLLBACK TO SAVEPOINT caso')
        await c.query('RESET ROLE')
        if (codigo !== PERMISO_DENEGADO) throw new Error(`¡ALERTA! ${nombre}: error inesperado ${codigo} ${mensajeDeError(e)}`)
        console.log(`✓ rechazado (42501): ${nombre}`)
        return
      }
      await c.query('RELEASE SAVEPOINT caso')
      await salirDeSesion()
      console.log(`✓ rechazado (${resultado}): ${nombre}`)
    }
    await escrituraRechazada('UPDATE de call_outcome', `UPDATE contact_activities SET call_outcome = 'agendo' WHERE id = $1`)
    await escrituraRechazada('UPDATE de body', `UPDATE contact_activities SET body = '[TEST] cambiado' WHERE id = $1`)
    await escrituraRechazada('UPDATE de occurred_at', `UPDATE contact_activities SET occurred_at = now() - interval '1 hour' WHERE id = $1`)
    await escrituraRechazada('UPDATE de voided_at', `UPDATE contact_activities SET voided_at = now() WHERE id = $1`)
    await escrituraRechazada('DELETE', `DELETE FROM contact_activities WHERE id = $1`)

    const despues = await c.query<Record<string, unknown>>(
      `SELECT call_outcome, body, occurred_at::text, voided_at::text FROM contact_activities WHERE id = $1`, [llamada.id])
    ok(despues.rows.length === 1 && JSON.stringify(despues.rows[0]) === JSON.stringify(original),
      'con RESET ROLE, la llamada de prueba sigue ahí y con los mismos valores')

    // ── 8. Borrar el contacto borra sus actividades y suelta la tarea ────────────────────
    await c.query(`DELETE FROM contacts WHERE id = $1`, [contacto.id])
    const quedan = await uno<{ n: number }>(
      `SELECT count(*)::int AS n FROM contact_activities WHERE contact_id = $1`, [contacto.id])
    ok(quedan.n === 0, 'borrar el contacto borra sus actividades (CASCADE)')
    const t = await uno<{ s: string | null }>(`SELECT source_activity_id::text AS s FROM tasks WHERE id = $1`, [tarea.id])
    ok(t.s === null, 'la tarea de prueba queda con source_activity_id en NULL')
  } finally {
    await c.query('ROLLBACK')
    console.log('· ROLLBACK de todo lo insertado')
  }

  const final = await contarFilasDePrueba()
  console.log(`filas de prueba después: ${JSON.stringify(final)}`)
  ok(sinFilas(final), 'no quedó ninguna fila de prueba')

  const n = await uno<{ n: number }>(`SELECT count(*)::int AS n FROM contact_activities`)
  console.log(`filas en contact_activities: ${n.n}`)
  await c.end()
  console.log('\n✅ aplicada y verificada')
}

main().catch((e: unknown) => {
  console.error('Error:', mensajeDeError(e))
  process.exit(1)
})
