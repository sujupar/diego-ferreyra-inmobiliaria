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
 */

/** Cuántos trabajos como mucho por corrida. */
const LOTE = 25

/**
 * Techo de tiempo de una corrida. Las funciones de Netlify se cortan bastante
 * antes de los 60 s y `maxDuration` es una directiva de Vercel que acá no
 * aplica. Cuando se acaba el presupuesto la corrida devuelve lo hecho y el resto
 * queda para el minuto siguiente — no se toma un trabajo que no se va a poder
 * terminar.
 */
const PRESUPUESTO_MS = 20_000

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
  created_at: string
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

export async function runFunnelSideEffectsWorker(): Promise<ResumenCorrida> {
  const sb = admin()
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
    .select('id, submission_id, kind, payload, attempts, max_attempts, created_at')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date(arranque).toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(LOTE)
  if (error) throw new Error(`funnel_lead_jobs: ${error.message}`)

  const { ejecutarTrabajo } = await import('@/lib/funnel/side-effect-handlers')

  for (const fila of ordenarTrabajos((candidatos ?? []) as FilaTrabajo[])) {
    if (Date.now() - arranque > PRESUPUESTO_MS) {
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
      await sb
        .from('funnel_lead_jobs')
        .update({ status: resultado, claimed_at: null, last_error: null, updated_at: fin })
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
