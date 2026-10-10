/**
 * Aplica `20261010000003_property_visits_escritura_solo_servidor.sql` (cierra la escritura
 * directa a property_visits por la API REST) y VERIFICA que quedó cerrada, TODO dentro de UNA
 * transacción.
 *
 *   Simulacro (por defecto — no deja NADA, termina en ROLLBACK):
 *     node --env-file=.env.local --import tsx scripts/apply-visitas-escritura-pg.ts
 *   De verdad (COMMIT solo si TODAS las verificaciones pasan):
 *     node --env-file=.env.local --import tsx scripts/apply-visitas-escritura-pg.ts --commit
 *
 * ORDEN: el `--commit` va DESPUÉS del deploy de feat/sistema-visitas (ver la cabecera de la
 * migración: el código viejo de producción escribe con la sesión del usuario).
 *
 * Las pruebas con sesión simulada (SET LOCAL ROLE authenticated + request.jwt.claims, como
 * scripts/apply-visitas-origen-pg.ts) corren cada una en su SAVEPOINT, y todo el bloque de
 * pruebas dentro de otro SAVEPOINT que se deshace antes del COMMIT: no queda ninguna fila de
 * prueba ni en el modo `--commit`.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261010000003_property_visits_escritura_solo_servidor.sql'
const DE_VERDAD = process.argv.includes('--commit')
/** Código de Postgres para "permiso denegado" (insufficient_privilege). */
const PERMISO_DENEGADO = '42501'

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

function codigoDeError(e: unknown): string | null {
  if (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string') {
    return (e as { code: string }).code
  }
  return null
}

type Resultado =
  | { tipo: 'filas'; cantidad: number }
  | { tipo: 'error'; codigo: string | null; mensaje: string }

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()

  /**
   * Corre UNA sentencia con la sesión simulada de `uid`, aislada en su propio SAVEPOINT: el
   * ROLLBACK TO SAVEPOINT deshace tanto lo que la sentencia haya escrito como el SET LOCAL ROLE
   * y los claims (se fijaron DESPUÉS del savepoint), así la prueba siguiente arranca limpia.
   */
  let nPrueba = 0
  async function comoUsuario(uid: string, sql: string, params: unknown[]): Promise<Resultado> {
    const sp = `prueba_${++nPrueba}`
    await c.query(`SAVEPOINT ${sp}`)
    try {
      await c.query('SET LOCAL ROLE authenticated')
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
      const r = await c.query(sql, params)
      return { tipo: 'filas', cantidad: r.rowCount ?? 0 }
    } catch (e) {
      return { tipo: 'error', codigo: codigoDeError(e), mensaje: e instanceof Error ? e.message : String(e) }
    } finally {
      await c.query(`ROLLBACK TO SAVEPOINT ${sp}`)
      await c.query('RESET ROLE')
    }
  }

  function esDenegado(r: Resultado): boolean {
    return r.tipo === 'error' && r.codigo === PERMISO_DENEGADO
  }
  function describir(r: Resultado): string {
    return r.tipo === 'filas' ? `${r.cantidad} fila(s)` : `error ${r.codigo ?? '?'}: ${r.mensaje}`
  }

  try {
    await c.query("SET lock_timeout = '5s'")
    await c.query('BEGIN')
    await c.query(readFileSync(MIGRACION, 'utf8'))
    console.log(`migración aplicada (sin commitear todavía; modo: ${DE_VERDAD ? 'COMMIT' : 'SIMULACRO'}); verificando…`)

    // ─── Estructura: sin políticas de escritura, sin permisos de escritura ───
    const { rows: politicas } = await c.query(
      `SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='property_visits' ORDER BY policyname`)
    ok(politicas.every(p => p.cmd === 'SELECT'), `solo quedan políticas de lectura (${politicas.map(p => `${p.policyname}:${p.cmd}`).join(', ')})`)
    ok(politicas.some(p => p.policyname === 'property_visits_select_scoped'), 'la lectura acotada (property_visits_select_scoped) sigue')
    for (const rol of ['anon', 'authenticated']) {
      for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        const { rows } = await c.query(`SELECT has_table_privilege($1, 'public.property_visits', $2) AS tiene`, [rol, priv])
        ok(rows[0].tiene === false, `${rol} ya no tiene ${priv} sobre property_visits`)
      }
    }
    const { rows: lectura } = await c.query(`SELECT has_table_privilege('authenticated', 'public.property_visits', 'SELECT') AS tiene`)
    ok(lectura[0].tiene === true, 'authenticated conserva SELECT (la RLS de lectura decide qué ve)')

    // ─── Pruebas con sesión simulada ───
    await c.query('SAVEPOINT pruebas')
    try {
      const { rows: asesores } = await c.query(`SELECT id FROM profiles WHERE role='asesor' AND is_active ORDER BY created_at LIMIT 1`)
      const { rows: abogados } = await c.query(`SELECT id FROM profiles WHERE role='abogado' ORDER BY created_at LIMIT 1`)
      ok(asesores.length === 1, 'hay un perfil con role=asesor activo para probar')
      const ase = asesores[0].id as string
      const abo = (abogados[0]?.id as string | undefined) ?? null

      // Una visita de prueba DEL asesor, creada con el rol del script (como hace el servidor):
      // así el UPDATE "de una visita suya" se prueba aunque hoy no tenga ninguna.
      const { rows: prop } = await c.query(`SELECT id FROM properties WHERE status='approved' LIMIT 1`)
      ok(prop.length === 1, 'hay una propiedad captada para la visita de prueba')
      const { rows: v } = await c.query(
        `INSERT INTO property_visits (property_id, advisor_id, created_by, client_name, client_phone, scheduled_at, status, origin)
         VALUES ($1, $2, $2, '[TEST] escritura solo servidor', '+5491100000000', now() + interval '1 day', 'pending_confirmation', 'cartel')
         RETURNING id`, [prop[0].id, ase])
      const idPrueba = v[0].id as string
      ok(Boolean(idPrueba), 'con el rol del script se puede INSERTAR (es el camino del servidor)')

      const insertar = `INSERT INTO property_visits (property_id, advisor_id, created_by, client_name, client_phone, scheduled_at, status, origin)
         VALUES ($1, $2, $2, '[TEST] intento directo', '+5491100000000', now() + interval '1 day', 'pending_confirmation', 'cartel')`

      const insAsesor = await comoUsuario(ase, insertar, [prop[0].id, ase])
      ok(esDenegado(insAsesor), `asesor: INSERT directo rechazado con ${PERMISO_DENEGADO} (${describir(insAsesor)})`)

      const updAsesor = await comoUsuario(ase,
        `UPDATE property_visits SET status='scheduled', advisor_id=$2 WHERE id=$1`, [idPrueba, ase])
      if (esDenegado(updAsesor)) {
        ok(true, `asesor: UPDATE de una visita SUYA rechazado con ${PERMISO_DENEGADO}`)
      } else {
        ok(updAsesor.tipo === 'filas' && updAsesor.cantidad === 0,
          `asesor: UPDATE de una visita suya no toca nada (${describir(updAsesor)})`)
        console.log('  ↳ (rechazado por 0 filas, no por permiso denegado)')
      }

      const delAsesor = await comoUsuario(ase, `DELETE FROM property_visits WHERE id=$1`, [idPrueba])
      ok(esDenegado(delAsesor) || (delAsesor.tipo === 'filas' && delAsesor.cantidad === 0),
        `asesor: DELETE de una visita suya no borra nada (${describir(delAsesor)})`)

      if (abo) {
        const insAbogado = await comoUsuario(abo, insertar, [prop[0].id, abo])
        ok(esDenegado(insAbogado), `abogado: INSERT directo rechazado con ${PERMISO_DENEGADO} (${describir(insAbogado)})`)
      } else {
        console.log('⚠ no hay ningún perfil role=abogado: no se pudo probar el INSERT del abogado')
      }

      // La lectura NO cambia: el asesor sigue viendo SOLO lo suyo (y lo ve).
      const lectAjenas = await comoUsuario(ase,
        `SELECT 1 FROM property_visits WHERE advisor_id IS DISTINCT FROM $1 AND created_by IS DISTINCT FROM $1`, [ase])
      ok(lectAjenas.tipo === 'filas' && lectAjenas.cantidad === 0, `asesor: no ve visitas ajenas (${describir(lectAjenas)})`)
      const lectPropia = await comoUsuario(ase, `SELECT 1 FROM property_visits WHERE id=$1`, [idPrueba])
      ok(lectPropia.tipo === 'filas' && lectPropia.cantidad === 1, `asesor: sigue viendo su visita (${describir(lectPropia)})`)

      // El servidor (rol del script y service_role, que es la clave que usa la app) sigue escribiendo.
      await c.query('SAVEPOINT servidor_postgres')
      const updPostgres = await c.query(`UPDATE property_visits SET notes = notes WHERE id=$1`, [idPrueba])
      await c.query('ROLLBACK TO SAVEPOINT servidor_postgres')
      ok(updPostgres.rowCount === 1, 'con el rol del script un UPDATE inocuo funciona')

      await c.query('SAVEPOINT servidor_service_role')
      try {
        await c.query('SET LOCAL ROLE service_role')
        const updServicio = await c.query(`UPDATE property_visits SET notes = notes WHERE id=$1`, [idPrueba])
        ok(updServicio.rowCount === 1, 'con service_role (la clave del servidor) un UPDATE inocuo funciona')
      } finally {
        await c.query('ROLLBACK TO SAVEPOINT servidor_service_role')
        await c.query('RESET ROLE')
      }
    } finally {
      await c.query('RESET ROLE')
      await c.query('ROLLBACK TO SAVEPOINT pruebas')
    }

    const { rows: resto } = await c.query(
      `SELECT count(*)::int n FROM property_visits WHERE client_name IN ('[TEST] escritura solo servidor', '[TEST] intento directo')`)
    ok(resto[0].n === 0, 'ninguna fila de prueba quedó (los SAVEPOINT ya se deshicieron)')

    const { rows: finales } = await c.query(
      `SELECT policyname, cmd, roles::text AS roles FROM pg_policies WHERE schemaname='public' AND tablename='property_visits' ORDER BY policyname`)
    console.log('\nPolíticas que quedan en property_visits:')
    for (const p of finales) console.log(`  · ${p.policyname} — ${p.cmd} — ${p.roles}`)

    if (DE_VERDAD) {
      await c.query('COMMIT')
      console.log('\n✅ aplicada y verificada (COMMIT)')
    } else {
      await c.query('ROLLBACK')
      console.log('\n✅ SIMULACRO OK: todas las verificaciones pasaron y se hizo ROLLBACK (no quedó nada). Para aplicarla: --commit')
    }
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await c.end()
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
