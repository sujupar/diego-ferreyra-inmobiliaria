import { createClient } from '@supabase/supabase-js'
import {
  ordenarTrabajos,
  siguienteIntento,
  type TipoDeTrabajo,
} from '@/lib/funnel/jobs-logic'

/**
 * Worker de los avisos diferidos del embudo.
 *
 * Lo dispara pg_cron cada minuto (`POST /api/cron/funnel-side-effects`), NO el
 * scheduler de Netlify: en este sitio las scheduled functions no se invocan
 * nunca (bug del plugin sobre Next 16 — ver CLAUDE.md). Calcado de
 * `lib/portals/worker.ts`, que corre por el mismo camino desde hace meses.
 *
 * Tres reglas que hacen que esto sea seguro:
 *
 *  1. RESUCITAR ANTES DE TOMAR. Un worker puede morir a mitad (la función se
 *     corta, el proceso se recicla) dejando trabajos en 'running' para siempre.
 *     Lo primero de cada corrida es devolver a 'pending' los que quedaron
 *     tomados hace demasiado.
 *  2. TOMAR CON UN UPDATE CONDICIONAL. `where id = X and status = 'pending'`:
 *     si no devuelve fila, otro worker se lo llevó primero. Dos corridas
 *     solapadas no pueden mandar el mismo email dos veces.
 *  3. GASTAR EL INTENTO AL TOMAR, no al terminar. Un trabajo que mata al worker
 *     igual gasta intento y termina en 'failed' en vez de dar vueltas eterno.
 *  4. CERRAR AL AGOTADO ANTES DE EJECUTAR NADA. La regla 3 sola no alcanzaba: el
 *     único lugar que escribía 'failed' era el `catch` del bucle, y ese `catch`
 *     no corre cuando la función se muere a mitad. La fila quedaba 'running' →
 *     el reaper la devolvía a 'pending' → se volvía a tomar, con `attempts`
 *     creciendo sin techo y sin llegar NUNCA a 'failed'. El aviso no salía y
 *     nadie se enteraba. Ahora el estado agotado se detecta al armar el lote.
 */

/** Cuántos trabajos como mucho por corrida. */
const LOTE = 25

/**
 * Lo que aguanta una función de este sitio antes de que el gateway corte con un
 * 504 (ver la regla dura de CLAUDE.md: `maxDuration` es de Vercel y acá NO
 * aplica).
 */
export const TECHO_NETLIFY_MS = 26_000

/**
 * Techo por envío individual del cliente de email (`TECHO_ENVIO_MS` en
 * `lib/email/resend-client.ts`). Se repite acá en vez de importarse para no
 * arrastrar el SDK de Resend al módulo del worker; si allá cambia, este número
 * cambia con él.
 */
const TECHO_POR_ENVIO_MS = 8_000

/**
 * Cuánta gente recibe el aviso por email del embudo. VERIFICADO CONTRA LA BASE
 * el 2026-08-08, no estimado: `createFunnelLead` no setea `deals.created_by`, así
 * que `getDealStakeholders` resuelve `coordinador = null` y el aviso va solo a
 * los admins/dueños activos, que hoy son 2. Los 45 envíos reales de
 * `appraisal_request_admins` + `class_registration_admins` en
 * `email_notifications_log` fueron a exactamente 2 destinatarios, 45 de 45.
 *
 * SI ESTE NÚMERO SUBE (se activa otro admin/dueño, o un deal del embudo empieza
 * a llegar con `created_by`), el presupuesto de abajo deja de cerrar: con 3
 * destinatarios el peor trabajo se va a 25 s y ya no entra en el techo. El test
 * `el presupuesto cierra con el peor trabajo` es el que avisa.
 */
const DESTINATARIOS_DEL_AVISO = 2

/** Lo que gasta el trabajo `notify` fuera de Resend: stakeholders, render del HTML, chequeo de idempotencia y log por destinatario. */
const RESTO_DEL_TRABAJO_MS = 1_000

/**
 * El trabajo más caro que existe hoy: `notify`. `sendEmail` manda de a UN
 * destinatario por vez (bucle `for` con `await`), cada uno con su propio techo.
 */
export const PEOR_TRABAJO_MS = DESTINATARIOS_DEL_AVISO * TECHO_POR_ENVIO_MS + RESTO_DEL_TRABAJO_MS

/** Colchón para el arranque de la corrida (el reaper y la consulta de candidatos). */
const MARGEN_MS = 1_000

/**
 * Techo de tiempo de una corrida.
 *
 * OJO CON LA ARITMÉTICA: el presupuesto se chequea ANTES de tomar el trabajo,
 * nunca durante. O sea que una corrida puede durar `PRESUPUESTO_MS` + lo que
 * tarde el trabajo que arrancó justo en el límite. Con los 20 s que tenía antes,
 * una corrida que tomaba un `notify` en t=19 s podía terminar en t=36 s: muy por
 * encima del techo de la función, y el corte llegaba a mitad de un envío.
 *
 * Por eso el número no se elige, se despeja: 26 000 − 17 000 − 1 000 = 8 000.
 */
export const PRESUPUESTO_MS = TECHO_NETLIFY_MS - PEOR_TRABAJO_MS - MARGEN_MS

/**
 * A partir de cuándo un 'running' se considera colgado. Muy por encima de lo que
 * puede durar una corrida entera, así que nunca le saca un trabajo a un worker
 * que sigue trabajando.
 */
const COLGADO_MS = 5 * 60_000

export interface ResumenCorrida {
  ok: true
  resucitados: number
  hechos: number
  salteados: number
  reintentar: number
  fallados: number
  /** true si la corrida se quedó sin presupuesto de tiempo y dejó cosas pendientes. */
  truncada: boolean
}

interface FilaTrabajo {
  id: string
  submission_id: string
  kind: TipoDeTrabajo
  payload: Record<string, unknown> | null
  attempts: number
  max_attempts: number
  last_error: string | null
  created_at: string
}

/** Columnas que el worker necesita de cada fila. */
const COLUMNAS = 'id, submission_id, kind, payload, attempts, max_attempts, last_error, created_at'

export interface OpcionesCorrida {
  /** Solo para los tests: permite comprobar el corte por presupuesto sin esperar 8 s reales. */
  presupuestoMs?: number
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type SB = ReturnType<typeof admin>

/** Regla 1: los 'running' que quedaron colgados vuelven a la cola. */
async function resucitarColgados(sb: SB, ahoraMs: number): Promise<number> {
  const limite = new Date(ahoraMs - COLGADO_MS).toISOString()
  const { data, error } = await sb
    .from('funnel_lead_jobs')
    .update({
      status: 'pending',
      claimed_at: null,
      next_attempt_at: new Date(ahoraMs).toISOString(),
      updated_at: new Date(ahoraMs).toISOString(),
    })
    .eq('status', 'running')
    .lt('claimed_at', limite)
    .select('id')
  if (error) {
    console.error('[funnel-jobs] no se pudieron resucitar los colgados:', error.message)
    return 0
  }
  return (data ?? []).length
}

/**
 * Un trabajo agotó sus reintentos. Recién ACÁ se molesta a los admins: una vez
 * por trabajo, con el error real, y nunca en el primer tropiezo.
 */
async function escalarTrabajoAgotado(fila: FilaTrabajo, mensaje: string): Promise<void> {
  try {
    const { notifyAdminEmailFailure } = await import('@/lib/email/notifications/admin-failure-alert')
    await notifyAdminEmailFailure({
      failedNotificationType: `embudo:${fila.kind}`,
      entityType: 'funnel_lead_submission',
      entityId: fila.submission_id,
      errors: [mensaje],
    })
  } catch (err) {
    // Sin recurrencia: si la alerta también falla, solo queda el log. El trabajo
    // ya está en 'failed' y visible en la tabla.
    console.error('[funnel-jobs] la alerta a admins también falló:', err)
  }
}

/**
 * Cierra un trabajo que ya gastó todos sus intentos SIN haber pasado por el
 * `catch` del bucle.
 *
 * Cómo se llega acá: el worker muere a mitad (la función se corta, el proceso se
 * recicla). El intento ya se gastó al TOMAR, pero el `catch` nunca corre, así que
 * la fila queda 'running' con `status` intacto; a los 5 minutos el reaper la
 * devuelve a 'pending' y se vuelve a tomar. Sin este cierre, `attempts` crecía
 * sin techo, la fila nunca llegaba a 'failed' y `escalarTrabajoAgotado` NO se
 * disparaba jamás: el aviso no salía y nadie se enteraba.
 *
 * El UPDATE es condicional (`status = 'pending'`) por la misma razón que la toma:
 * si dos corridas se solapan, solo una escala.
 */
async function cerrarAgotado(sb: SB, fila: FilaTrabajo): Promise<boolean> {
  const ahora = new Date().toISOString()
  const motivo =
    fila.last_error ??
    `agotó los ${fila.max_attempts} intentos sin llegar a terminar ` +
      '(el worker se cortó a mitad: el trabajo nunca registró su propio error)'
  const { data, error } = await sb
    .from('funnel_lead_jobs')
    .update({
      status: 'failed',
      claimed_at: null,
      next_attempt_at: ahora,
      last_error: motivo.slice(0, 2000),
      updated_at: ahora,
    })
    .eq('id', fila.id)
    .eq('status', 'pending')
    .select('id')
  if (error) {
    console.error(`[funnel-jobs] no se pudo cerrar el agotado ${fila.id}:`, error.message)
    return false
  }
  return (data ?? []).length > 0
}

export async function runFunnelSideEffectsWorker(
  opciones: OpcionesCorrida = {},
): Promise<ResumenCorrida> {
  const sb = admin()
  const presupuestoMs = opciones.presupuestoMs ?? PRESUPUESTO_MS
  const arranque = Date.now()
  const resumen: ResumenCorrida = {
    ok: true,
    resucitados: 0,
    hechos: 0,
    salteados: 0,
    reintentar: 0,
    fallados: 0,
    truncada: false,
  }

  resumen.resucitados = await resucitarColgados(sb, arranque)

  const { data: candidatos, error } = await sb
    .from('funnel_lead_jobs')
    .select(COLUMNAS)
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date(arranque).toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(LOTE)
  if (error) throw new Error(`funnel_lead_jobs: ${error.message}`)

  const enCola = ordenarTrabajos((candidatos ?? []) as FilaTrabajo[])

  // Los que ya no tienen intentos NO se vuelven a ejecutar: se cierran y se
  // escalan acá, antes del bucle de ejecución. PostgREST no sabe comparar dos
  // columnas en un filtro (`attempts < max_attempts`), así que la partición se
  // hace en memoria sobre el lote.
  //
  // El cierre CUENTA contra el presupuesto: `escalarTrabajoAgotado` manda un
  // email, o sea otro tercero con su propio techo de tiempo. Si no alcanza, los
  // agotados que quedan siguen en 'pending' y se cierran en el tick siguiente —
  // no se pierde ninguna alerta, solo se demora un minuto.
  const pendientes: FilaTrabajo[] = []
  for (const fila of enCola) {
    if (fila.attempts < fila.max_attempts) {
      pendientes.push(fila)
      continue
    }
    if (Date.now() - arranque >= presupuestoMs) {
      resumen.truncada = true
      continue
    }
    if (!(await cerrarAgotado(sb, fila))) continue // otra corrida ya lo cerró
    resumen.fallados++
    const motivo = fila.last_error ?? `agotó los ${fila.max_attempts} intentos (el worker se cortó a mitad)`
    console.error(`[funnel-jobs] ${fila.kind} (${fila.id}) agotado sin pasar por el catch: ${motivo}`)
    await escalarTrabajoAgotado(fila, motivo)
  }

  const { ejecutarTrabajo } = await import('@/lib/funnel/side-effect-handlers')

  for (const fila of pendientes) {
    // `>=`, no `>`: un presupuesto consumido es un presupuesto consumido, y así
    // un presupuesto de 0 significa "no tomes nada" en vez de "tomá uno igual".
    if (Date.now() - arranque >= presupuestoMs) {
      resumen.truncada = true
      break
    }

    // Regla 2 + 3: tomar y gastar el intento en la misma escritura condicional.
    const intentos = fila.attempts + 1
    const ahora = new Date().toISOString()
    const { data: tomado, error: errorToma } = await sb
      .from('funnel_lead_jobs')
      .update({ status: 'running', claimed_at: ahora, attempts: intentos, updated_at: ahora })
      .eq('id', fila.id)
      .eq('status', 'pending')
      .select('id')
    if (errorToma) {
      console.error(`[funnel-jobs] no se pudo tomar ${fila.id}:`, errorToma.message)
      continue
    }
    if (!tomado || tomado.length === 0) continue // otro worker se lo llevó

    try {
      const resultado = await ejecutarTrabajo(fila.kind, (fila.payload ?? {}) as Record<string, unknown>)
      const fin = new Date().toISOString()
      // El payload se VACÍA al terminar. No es prolijidad: el trabajo `capi`
      // lleva la IP EN CLARO del visitante (más user-agent, nombre, email y
      // teléfono), porque Meta pide `client_ip_address` sin hashear. Hasta que
      // existió esta cola, la IP en claro NO estaba en la base: el sistema
      // guardaba solo `funnel_lead_submissions.ip_hash` (sha256 con sal), y esa
      // decisión fue explícita. Como las filas terminadas no se borran nunca,
      // cada lead dejaba una fila con la IP para siempre.
      //
      // Se vacía en 'done' y en 'skipped' —los dos finales de los que no queda
      // nada por hacer—. En 'failed' NO se toca: es la única forma de volver a
      // encolar un trabajo a mano (`status='pending', attempts=0`) después de
      // arreglar la causa, y sin payload ese reintento fallaría con
      // 'falta "dealId"'. Son pocas filas y quedan a la vista; la purga por
      // antigüedad (ver el reporte de esta ola) es la que las alcanza.
      await sb
        .from('funnel_lead_jobs')
        .update({ status: resultado, claimed_at: null, last_error: null, payload: {}, updated_at: fin })
        .eq('id', fila.id)
      if (resultado === 'skipped') resumen.salteados++
      else resumen.hechos++
    } catch (err) {
      // Un aviso que falla NO puede arrastrar a los otros cuatro: cada trabajo
      // vive y muere solo. Por eso el try/catch está adentro del bucle.
      const mensaje = err instanceof Error ? err.message : String(err)
      const estado = siguienteIntento(intentos, fila.max_attempts)
      const fin = new Date().toISOString()
      await sb
        .from('funnel_lead_jobs')
        .update({
          status: estado.status,
          next_attempt_at: estado.next_attempt_at ?? fin,
          claimed_at: null,
          last_error: mensaje.slice(0, 2000),
          updated_at: fin,
        })
        .eq('id', fila.id)
      console.error(`[funnel-jobs] ${fila.kind} (${fila.id}) intento ${intentos}/${fila.max_attempts}: ${mensaje}`)
      if (estado.status === 'failed') {
        resumen.fallados++
        await escalarTrabajoAgotado(fila, mensaje)
      } else {
        resumen.reintentar++
      }
    }
  }

  return resumen
}
