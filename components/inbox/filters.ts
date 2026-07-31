/**
 * Filtro + orden de la lista de conversaciones (task 4). Función PURA para
 * poder probarla sin DOM (`filters.test.ts`) y para que `ConversationList`
 * quede como un wrapper delgado sobre esto + el `useState` de los controles.
 *
 * Todo client-side sobre la lista YA cargada — misma decisión que el código
 * anterior (`WhatsappClient.tsx` pre-rediseño): la lista completa viaja en
 * cada poll, así que filtrar en memoria evita ida y vuelta al servidor por
 * cada cambio de filtro. Los query params documentados en el contrato de
 * task 3 (`?tag=&state=&advisor=&unanswered=1&q=`) son los que el OTRO agente
 * puede usar para paginar/acotar en el futuro; esto no depende de que existan
 * — funciona igual si el GET siempre devuelve la lista completa.
 */
import type { ConversationListItem } from './types'
import { resolveAwaitingSince } from './awaiting'

export interface ConversationFilters {
  search: string
  propertyId: string // 'all' | id
  advisorId: string // 'all' | id
  tagSlug: string // 'all' | slug
  pipelineState: string // 'all' | estado
  onlyUnread: boolean
  /** El filtro más útil de todos (brief task 3): conversaciones cuyo último mensaje es del cliente y nadie contestó. */
  onlyUnanswered: boolean
}

export const DEFAULT_CONVERSATION_FILTERS: ConversationFilters = {
  search: '',
  propertyId: 'all',
  advisorId: 'all',
  tagSlug: 'all',
  pipelineState: 'all',
  onlyUnread: false,
  onlyUnanswered: false,
}

export function filterConversations(
  list: ConversationListItem[],
  f: ConversationFilters,
): ConversationListItem[] {
  const term = f.search.trim().toLowerCase()

  let result = list.filter(c => {
    if (f.onlyUnread && c.unread_count === 0) return false
    if (f.onlyUnanswered && !resolveAwaitingSince(c)) return false
    if (f.propertyId !== 'all' && c.property_id !== f.propertyId) return false
    if (f.advisorId !== 'all' && c.advisor_id !== f.advisorId) return false
    if (f.tagSlug !== 'all' && !(c.tags ?? []).some(t => t.slug === f.tagSlug)) return false
    if (f.pipelineState !== 'all' && c.pipeline_state !== f.pipelineState) return false
    if (term) {
      const haystack = [
        c.contact_name,
        c.phone_e164,
        c.last_message,
        c.property?.address,
        c.lead_number ? `#${c.lead_number}` : null,
        ...(c.tags ?? []).map(t => t.label),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(term)) return false
    }
    return true
  })

  // "Ordenadas por cuánto hace que esperan" (brief task 3) — la más vieja
  // (la que más tiempo lleva enfriándose) primero. Solo se reordena en este
  // modo: fuera de él, el orden natural (última actividad) es el esperado.
  if (f.onlyUnanswered) {
    result = [...result].sort((a, b) => {
      const aSince = resolveAwaitingSince(a)
      const bSince = resolveAwaitingSince(b)
      if (!aSince && !bSince) return 0
      if (!aSince) return 1
      if (!bSince) return -1
      return new Date(aSince).getTime() - new Date(bSince).getTime()
    })
  }

  return result
}
