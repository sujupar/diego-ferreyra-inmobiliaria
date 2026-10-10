/**
 * Aplica `20261010000002_visitas_origen_e_historial.sql` y VERIFICA lo que importa, TODO
 * dentro de UNA SOLA transacción: si cualquier verificación falla, se hace ROLLBACK de la
 * migración entera (no queda nada aplicado a medias) y el proceso sale con código 1. "Abortar"
 * significa eso — no solo "salir con error" (auditoría, I3).
 *
 * Las pruebas de triggers y de RLS corren dentro de SAVEPOINT que se deshacen ANTES del COMMIT
 * final: no dejan filas de prueba, y un fallo ahí también aborta la migración completa porque
 * el error sigue de largo hasta el catch de afuera.
 *
 *   node --env-file=.env.local --import tsx scripts/apply-visitas-origen-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()

  try {
    // (auditoría, M5): si algo tiene un lock al momento de aplicar, fallar rápido en vez de
    // esperar hasta el statement_timeout de 2 minutos bloqueando las lecturas que lleguen detrás.
    await c.query("SET lock_timeout = '5s'")
    // (auditoría, I3): todo lo que sigue, migración + verificaciones, en UNA transacción.
    await c.query('BEGIN')

    await c.query(readFileSync('supabase/migrations/20261010000002_visitas_origen_e_historial.sql', 'utf8'))
    console.log('migración aplicada (sin commitear todavía); verificando…')

    const { rows: cols } = await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='property_visits'`)
    const nombres = new Set(cols.map(r => r.column_name as string))
    for (const col of ['origin', 'origin_detail', 'lead_id', 'portal_inquiry_id', 'confirmed_at', 'outcome_at',
      'outcome_reason', 'advisor_interest', 'reschedule_count', 'changed_by']) {
      ok(nombres.has(col), `property_visits.${col} existe`)
    }
    const { rows: rls } = await c.query(
      `SELECT relrowsecurity FROM pg_class WHERE relname='property_visit_events' AND relnamespace='public'::regnamespace`)
    ok(rls[0]?.relrowsecurity === true, 'property_visit_events con RLS')
    const { rows: pol } = await c.query(`SELECT policyname FROM pg_policies WHERE tablename='property_visits' AND cmd='SELECT'`)
    ok(pol.length === 1 && pol[0].policyname === 'property_visits_select_scoped', 'una sola política de lectura: property_visits_select_scoped')
    const { rows: norm } = await c.query(`SELECT count(*)::int n FROM portal_inquiries WHERE phone_norm IS NOT NULL`)
    ok(norm[0].n > 400, `portal_inquiries.phone_norm calculado (${norm[0].n} filas)`)

    // ─── Pruebas de trigger (como postgres, bypassrls — prueban la LÓGICA, no la RLS) ───
    await c.query('SAVEPOINT triggers')
    try {
      const { rows: prop } = await c.query(`SELECT id FROM properties WHERE status='approved' LIMIT 1`)
      const { rows: v } = await c.query(
        `INSERT INTO property_visits (property_id, client_name, client_phone, scheduled_at, status, origin)
         VALUES ($1, '[TEST] trigger', '+5491100000000', now() + interval '1 day', 'pending_confirmation', 'portal')
         RETURNING id`, [prop[0].id])
      const id = v[0].id as string
      const eventos = async () => (await c.query(
        `SELECT kind, reason FROM property_visit_events WHERE visit_id=$1 ORDER BY created_at, kind`, [id])).rows
      ok((await eventos()).some(e => e.kind === 'creada'), 'insertar deja el evento "creada"')

      await c.query(`UPDATE property_visits SET status='scheduled' WHERE id=$1`, [id])
      const conf = (await c.query(`SELECT confirmed_at FROM property_visits WHERE id=$1`, [id])).rows[0]
      ok(conf.confirmed_at !== null, 'confirmar completa confirmed_at')
      ok((await eventos()).some(e => e.kind === 'confirmada'), 'confirmar deja el evento "confirmada"')

      await c.query(`UPDATE property_visits SET scheduled_at = scheduled_at + interval '1 hour' WHERE id=$1`, [id])
      const rep = (await c.query(`SELECT reschedule_count FROM property_visits WHERE id=$1`, [id])).rows[0]
      ok(rep.reschedule_count === 1, 'reprogramar suma reschedule_count')

      await c.query(`UPDATE property_visits SET status='no_show', outcome_reason='no_vino' WHERE id=$1`, [id])
      const fin = (await c.query(`SELECT outcome_at FROM property_visits WHERE id=$1`, [id])).rows[0]
      ok(fin.outcome_at !== null, 'no realizada completa outcome_at')
      ok((await eventos()).some(e => e.kind === 'no_realizada' && e.reason === 'no_vino'), 'evento "no_realizada" con motivo')

      // Reabrir: motivo y nota viejos se limpian (I2); completion_notes con un valor NUEVO en
      // la misma escritura sobrevive y el evento 'reabierta' lo copia.
      await c.query(`UPDATE property_visits SET status='scheduled', completion_notes='Reabierta: el cliente avisó que sí puede' WHERE id=$1`, [id])
      const reabierta = (await c.query(`SELECT outcome_reason, advisor_interest, completion_notes FROM property_visits WHERE id=$1`, [id])).rows[0]
      ok(reabierta.outcome_reason === null, 'reabrir limpia outcome_reason')
      ok(reabierta.advisor_interest === null, 'reabrir limpia advisor_interest')
      ok(reabierta.completion_notes === 'Reabierta: el cliente avisó que sí puede', 'reabrir CONSERVA la nota nueva mandada en la misma escritura')
      const notaReabierta = (await c.query(`SELECT note FROM property_visit_events WHERE visit_id=$1 AND kind='reabierta'`, [id])).rows[0]
      ok(notaReabierta?.note === 'Reabierta: el cliente avisó que sí puede', 'el evento "reabierta" copia la nota nueva')

      let rechazado = false
      try {
        await c.query('SAVEPOINT s_origen')
        await c.query(`UPDATE property_visits SET origin='tasacion' WHERE id=$1`, [id])
      } catch { rechazado = true; await c.query('ROLLBACK TO SAVEPOINT s_origen') }
      ok(rechazado, 'la base rechaza un origen fuera del catálogo')
    } finally {
      await c.query('ROLLBACK TO SAVEPOINT triggers')
    }

    // ─── Pruebas de RLS con sesión simulada (auditoría, I4) ───
    // Correr todo como `postgres` (rolbypassrls=true en producción) nunca ejercita la RLS
    // nueva, que es lo único que cambia el comportamiento del código viejo. Se simula sesión
    // de un asesor real y de un abogado con SET LOCAL ROLE + request.jwt.claims.
    await c.query('SAVEPOINT rls')
    try {
      const { rows: asesores } = await c.query(`SELECT id FROM profiles WHERE role='asesor' LIMIT 2`)
      const { rows: abogados } = await c.query(`SELECT id FROM profiles WHERE role='abogado' LIMIT 1`)
      ok(asesores.length >= 1, 'hay al menos un perfil con role=asesor para probar la RLS')
      const ase = asesores[0].id as string
      const otroAsesor = asesores[1]?.id as string | undefined
      const abo = abogados[0]?.id as string | undefined

      const comoUsuario = async (uid: string) => {
        await c.query('SET LOCAL ROLE authenticated')
        await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
      }

      const { rows: prop2 } = await c.query(`SELECT id FROM properties WHERE status='approved' LIMIT 1`)
      await comoUsuario(ase)
      const { rows: v2 } = await c.query(
        `INSERT INTO property_visits (property_id, advisor_id, created_by, client_name, client_phone, scheduled_at, status, origin)
         VALUES ($1,$2,$2,'[TEST] trigger rls','+5491100000000', now()+interval '1 day','pending_confirmation','portal') RETURNING id`,
        [prop2[0].id, ase])
      ok(v2.length === 1, 'INSERT … RETURNING con sesión de asesor (la RLS no lo bloquea)')
      const idRls = v2[0].id as string
      const upd = await c.query(`UPDATE property_visits SET status='scheduled' WHERE id=$1 RETURNING id`, [idRls])
      ok(upd.rowCount === 1, 'UPDATE … RETURNING con sesión de asesor (la RLS no lo bloquea)')
      await c.query(`UPDATE property_visits SET scheduled_at = scheduled_at + interval '1 hour' WHERE id=$1`, [idRls])

      const ev = (await c.query(`SELECT kind, actor_id FROM property_visit_events WHERE visit_id=$1`, [idRls])).rows
      ok(ev.length === 3, `exactamente 3 eventos: creada + confirmada + reprogramada (hubo ${ev.length})`)
      ok(ev.filter(e => e.kind === 'creada').length === 1, 'exactamente un "creada", no duplicado')
      ok(ev.some(e => e.kind === 'confirmada'), 'quedó el evento "confirmada"')
      ok(ev.some(e => e.kind === 'reprogramada'), 'quedó el evento "reprogramada"')
      ok(ev.every(e => e.actor_id === ase), 'el actor de CADA evento es el asesor de la sesión (I1: sale del JWT)')

      if (otroAsesor) {
        // Intento de falsificación: mandar changed_by de otra persona en el mismo UPDATE que
        // hace el propio asesor. El trigger lo tiene que pisar con auth.uid() porque hay sesión.
        await c.query(`UPDATE property_visits SET status='no_show', outcome_reason='no_vino', changed_by=$2 WHERE id=$1`, [idRls, otroAsesor])
        const evFalsificado = (await c.query(
          `SELECT actor_id FROM property_visit_events WHERE visit_id=$1 AND kind='no_realizada'`, [idRls])).rows[0]
        ok(evFalsificado?.actor_id === ase, 'no se puede falsificar el actor mandando otro changed_by: manda el JWT')
      } else {
        console.log('⚠ solo hay un perfil role=asesor: no se pudo probar la falsificación de changed_by')
      }

      if (abo) {
        await comoUsuario(abo)
        const visibles = await c.query(`SELECT 1 FROM property_visits WHERE id=$1`, [idRls])
        ok(visibles.rowCount === 0, 'el abogado no ve la visita (RLS nueva)')
        const historial = await c.query(`SELECT 1 FROM property_visit_events WHERE visit_id=$1`, [idRls])
        ok(historial.rowCount === 0, 'el abogado no ve el historial de la visita (RLS nueva)')
      } else {
        console.log('⚠ no hay ningún perfil role=abogado en esta base: no se pudo probar que el abogado ve 0')
      }
    } finally {
      // RESET ROLE antes del rollback: aunque ROLLBACK TO SAVEPOINT ya deshace el SET LOCAL
      // ROLE (quedó establecido DESPUÉS del savepoint), explicitarlo acá no depende de ese
      // detalle de implementación si algún día cambia.
      await c.query('RESET ROLE')
      await c.query('ROLLBACK TO SAVEPOINT rls')
    }

    // C1 se prueba en el arnés local de la auditoría, no acá: borrar un perfil real en
    // producción cascadea a muchas tablas y no vale la pena ni con rollback.

    const { rows: resto } = await c.query(
      `SELECT count(*)::int n FROM property_visits WHERE client_name IN ('[TEST] trigger', '[TEST] trigger rls')`)
    ok(resto[0].n === 0, 'ninguna fila de prueba quedó visible (los SAVEPOINT ya se deshicieron)')

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
