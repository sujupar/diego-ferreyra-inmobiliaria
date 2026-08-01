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

/**
 * Estados de un saliente que significan que el mensaje SALIÓ DE VERDAD hacia el
 * cliente: `accepted` (Meta nos devolvió 200 al postear) y los tres que después
 * pisa el webhook (`sent`/`delivered`/`read` — ver `mapMetaStatus` en
 * `lib/integrations/whatsapp/log.ts`, que son los únicos que Meta documenta
 * además de `failed`).
 *
 * Es LISTA BLANCA a propósito. Antes era lista negra (`!== 'failed' && !==
 * 'skipped'`) y eso convirtió en respuesta a la nota INTERNA que deja el agente
 * de IA cuando se rinde (`status:'agent_handoff'`, una fila que nunca sale por
 * la API de Meta): la conversación se marcaba como contestada y desaparecía del
 * filtro "Sin responder" justo en el momento en que tenía que entrar un humano.
 * Con lista blanca, un estado interno nuevo que a alguien se le ocurra mañana
 * deja la conversación VISIBLE como pendiente — el error se ve, no se esconde.
 * Por lo mismo, un estado ausente/vacío tampoco cuenta: que no sepamos qué pasó
 * con el mensaje no es prueba de que haya llegado.
 */
const REAL_OUTBOUND_STATUSES = new Set(['accepted', 'sent', 'delivered', 'read'])

export function countsAsReply(status: string | null | undefined): boolean {
  return REAL_OUTBOUND_STATUSES.has((status ?? '').trim().toLowerCase())
}

export function resolveAwaitingSince(
  item: Pick<ConversationListItem, 'awaiting_reply_since' | 'last_direction' | 'last_at' | 'last_status'>,
): string | null {
  if (item.awaiting_reply_since) return item.awaiting_reply_since
  // Respaldo, solo si el servidor no mandó el campo. Tiene que dar EXACTAMENTE
  // lo mismo que el agrupador de `GET /api/whatsapp/conversations` (que usa
  // esta misma `countsAsReply`): si se desalinean, la lista dice una cosa y el
  // filtro otra.
  if (item.last_direction === 'in') return item.last_at
  if (!countsAsReply(item.last_status)) return item.last_at
  return null
}

/**
 * Mismo cálculo pero a partir del último mensaje del HILO (no de la fila de la
 * lista) — lo usa `ChatThread` para la franja de demora.
 *
 * `status` es opcional solo por compatibilidad de firma: `ThreadMessage`
 * SIEMPRE lo trae, así que en la app real la regla que corre es la misma lista
 * blanca que en la lista y en el servidor. Si no viniera, un saliente se
 * asume enviado (comportamiento histórico) — la franja de más abajo es una
 * ayuda visual, no la fuente de verdad del filtro.
 */
export function resolveAwaitingSinceFromLastMessage(
  last: { direction: 'in' | 'out'; created_at: string; status?: string } | undefined,
): string | null {
  if (!last) return null
  if (last.direction === 'in') return last.created_at
  // Un saliente que nunca salió (la nota interna 'agent_handoff' del agente de
  // IA, un envío 'failed') deja al cliente esperando igual: el hilo tiene que
  // mostrar la franja, no darse por contestado.
  if (last.status !== undefined && !countsAsReply(last.status)) return last.created_at
  return null
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
