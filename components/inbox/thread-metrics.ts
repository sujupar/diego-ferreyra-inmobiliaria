/**
 * Métricas de una conversación para el panel del cliente (task 6: "primera
 * respuesta, tiempo medio, cuántos mensajes de cada lado"). Se calculan del
 * lado del cliente a partir de `Thread.messages` — ESE hilo ya trae todo lo
 * necesario (`GET /api/whatsapp/conversations/[phone]`, que no se toca en
 * esta tarea), así que no hace falta ningún endpoint nuevo.
 *
 * Definición de "el equipo respondió": la MISMA que usan el servidor
 * (`GET /api/whatsapp/conversations`) y la lista — `countsAsReply` de
 * `./awaiting`, lista blanca de estados de envío real. NO hay un criterio
 * propio acá.
 *
 * Acá antes decía, a propósito, "cualquier saliente cuenta, sea cual sea su
 * `status`". Ese "a propósito" es ANTERIOR al agente de IA, que hoy escribe en
 * `whatsapp_messages` tres filas SALIENTES que nunca salen hacia el cliente:
 * `agent_handoff`, `agent_visit_pending` y `agent_visit_failed` (constantes en
 * `lib/ai/scheduling-agent.ts`). Son notas internas, se escriben al instante y
 * con el criterio viejo hacían dos daños a la vez: marcaban la conversación
 * como contestada y dejaban un "primera respuesta: 1 min" glorioso justo en el
 * hilo donde el cliente sigue esperando. La métrica mentía peor cuanto peor
 * iba la conversación. Por lo mismo, `outboundCount` ("Del equipo", al lado de
 * "Del cliente") cuenta solo mensajes que el cliente PUDO VER.
 *
 * "Tiempo de respuesta": el tiempo entre un mensaje ENTRANTE y el primer
 * saliente REAL que llega después. Varios entrantes seguidos sin respuesta en
 * el medio cuentan como UNA sola espera (se resuelve con la primera saliente
 * real que aparece); una nota interna o un envío que rebotó no la resuelven.
 */
import type { ThreadMessage } from './types'
import { countsAsReply } from './awaiting'

export interface ThreadMetrics {
  firstResponseMs: number | null
  avgResponseMs: number | null
  inboundCount: number
  outboundCount: number
}

type MetricMessage = Pick<ThreadMessage, 'direction' | 'created_at' | 'status'>

/** Orden cronológico ascendente. El hilo ya viene ordenado de la API; esto es defensa, no confianza. */
function byDate<T extends { created_at: string }>(messages: T[]): T[] {
  return [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

export function computeThreadMetrics(messages: MetricMessage[]): ThreadMetrics {
  let inboundCount = 0
  let outboundCount = 0
  const responseTimes: number[] = []
  let pendingInboundAt: number | null = null

  for (const m of byDate(messages)) {
    const t = new Date(m.created_at).getTime()
    if (m.direction === 'in') {
      inboundCount++
      if (pendingInboundAt === null) pendingInboundAt = t
      continue
    }
    // Saliente. Si no salió de verdad (nota interna del agente de IA, envío
    // fallido, modo prueba), no es una respuesta: no se cuenta y NO cierra la
    // espera abierta — el cliente sigue esperando y el reloj sigue corriendo.
    if (!countsAsReply(m.status)) continue
    outboundCount++
    if (pendingInboundAt !== null) {
      responseTimes.push(t - pendingInboundAt)
      pendingInboundAt = null
    }
  }

  const firstResponseMs = responseTimes.length > 0 ? responseTimes[0] : null
  const avgResponseMs =
    responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null

  return { firstResponseMs, avgResponseMs, inboundCount, outboundCount }
}

/**
 * Desde cuándo el cliente está esperando, mirando el HILO ENTERO — lo usa la
 * franja de demora de `ChatThread`.
 *
 * Antes la franja miraba SOLO el último mensaje: si ese último mensaje era una
 * nota interna del agente de IA o un envío que rebotó, tomaba el `created_at`
 * de ESA fila nuestra como inicio de la espera. O sea: el cliente escribió a
 * las 10:00, la IA dejó su nota a las 13:00, y la franja anunciaba "el cliente
 * escribió hace instantes". Subestimaba justo el número que la franja existe
 * para gritar.
 *
 * Se recorre el hilo desde el final hacia atrás y gana el primer hecho
 * relevante — idéntico al barrido DESC del agrupador de
 * `GET /api/whatsapp/conversations`, para que la franja y el filtro "Sin
 * responder" nunca digan cosas distintas:
 *   - entrante  → esa es la espera abierta (el último entrante sin contestar);
 *   - saliente REAL → ya se le contestó, no hay espera;
 *   - saliente que no salió → se ignora y se sigue buscando hacia atrás.
 */
export function resolveThreadAwaitingSince(messages: MetricMessage[]): string | null {
  const sorted = byDate(messages)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = sorted[i]
    if (m.direction === 'in') return m.created_at
    if (countsAsReply(m.status)) return null
  }
  return null
}
