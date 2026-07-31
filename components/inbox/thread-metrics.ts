/**
 * Métricas de una conversación para el panel del cliente (task 6: "primera
 * respuesta, tiempo medio, cuántos mensajes de cada lado"). Se calculan del
 * lado del cliente a partir de `Thread.messages` — ESE hilo ya trae todo lo
 * necesario (`GET /api/whatsapp/conversations/[phone]`, que no se toca en
 * esta tarea), así que no hace falta ningún endpoint nuevo.
 *
 * Definición de "tiempo de respuesta": el tiempo entre un mensaje ENTRANTE y
 * el primer SALIENTE que llega después (sea cual sea su `status` — incluso
 * `skipped` en modo prueba cuenta, mismo criterio que
 * `lib/leads/pipeline-state.ts`: el hecho de negocio "el equipo respondió" ya
 * ocurrió). Varios entrantes seguidos sin saliente en el medio cuentan como
 * UNA sola espera (se resuelve con la primera saliente que aparece).
 */
import type { ThreadMessage } from './types'

export interface ThreadMetrics {
  firstResponseMs: number | null
  avgResponseMs: number | null
  inboundCount: number
  outboundCount: number
}

type MetricMessage = Pick<ThreadMessage, 'direction' | 'created_at'>

export function computeThreadMetrics(messages: MetricMessage[]): ThreadMetrics {
  let inboundCount = 0
  let outboundCount = 0
  const responseTimes: number[] = []
  let pendingInboundAt: number | null = null

  const sorted = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  for (const m of sorted) {
    const t = new Date(m.created_at).getTime()
    if (m.direction === 'in') {
      inboundCount++
      if (pendingInboundAt === null) pendingInboundAt = t
    } else {
      outboundCount++
      if (pendingInboundAt !== null) {
        responseTimes.push(t - pendingInboundAt)
        pendingInboundAt = null
      }
    }
  }

  const firstResponseMs = responseTimes.length > 0 ? responseTimes[0] : null
  const avgResponseMs =
    responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null

  return { firstResponseMs, avgResponseMs, inboundCount, outboundCount }
}
