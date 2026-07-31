/**
 * "Sin responder" — el filtro y la señal visual más importantes de esta
 * pantalla (task 3/4/5 brief: "es la plata que se está enfriando").
 *
 * `resolveAwaitingSince` es DEFENSIVA a propósito: el contrato nuevo de
 * `GET /api/whatsapp/conversations` (task 3, en paralelo) agrega
 * `awaiting_reply_since`, pero mientras ese endpoint no lo mande, se deriva
 * el mismo hecho de negocio de lo que YA existe hoy — si el último mensaje es
 * entrante, nadie contestó todavía, sea cual sea el motivo. Así la pantalla
 * nunca depende de que el otro agente termine primero.
 */
import type { ConversationListItem } from './types'

/** Umbral desde el que una espera se marca como "demasiado tiempo" (franja de alerta). Decisión de producto, no viene de ninguna tabla. */
export const AWAITING_ALERT_THRESHOLD_MS = 2 * 60 * 60 * 1000 // 2 horas

export function resolveAwaitingSince(
  item: Pick<ConversationListItem, 'awaiting_reply_since' | 'last_direction' | 'last_at' | 'last_status'>,
): string | null {
  if (item.awaiting_reply_since) return item.awaiting_reply_since
  // Respaldo, solo si el servidor no mandó el campo. Un saliente que FALLÓ no
  // cuenta como respuesta: el cliente sigue esperando aunque el último mensaje
  // de la conversación sea nuestro.
  if (item.last_direction === 'in') return item.last_at
  if (item.last_status === 'failed' || item.last_status === 'skipped') return item.last_at
  return null
}

/** Mismo cálculo pero a partir del último mensaje del HILO (no de la fila de la lista) — lo usa `ChatThread`. */
export function resolveAwaitingSinceFromLastMessage(
  last: { direction: 'in' | 'out'; created_at: string } | undefined,
): string | null {
  if (!last) return null
  return last.direction === 'in' ? last.created_at : null
}

export function isAwaitingTooLong(awaitingSinceIso: string | null, now: number = Date.now()): boolean {
  if (!awaitingSinceIso) return false
  return now - new Date(awaitingSinceIso).getTime() >= AWAITING_ALERT_THRESHOLD_MS
}

/** "hace 5 min" / "hace 3 h" / "hace 2 días" — mismo formato que `relativeTime`, function aparte para no acoplar este módulo a `format.ts`. */
export function waitingFor(awaitingSinceIso: string, now: number = Date.now()): string {
  const ms = now - new Date(awaitingSinceIso).getTime()
  const min = Math.max(0, Math.floor(ms / 60000))
  if (min < 1) return 'hace instantes'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d > 1 ? 's' : ''}`
}
