/**
 * Tipos compartidos del chat de WhatsApp del Inbox (tasks 4/5/6 del rediseño,
 * `.superpowers/sdd/2026-08-01-etiquetas-y-chat-crm/`). Antes vivían inline en
 * `WhatsappClient.tsx`; se centralizan acá porque ahora los importan también
 * `ConversationRow`, `ConversationList`, `ThreadHeader`, `ChatThread` y
 * `ContactPanel`.
 *
 * `tags` / `pipeline_state` / `assigned_to_name` / `awaiting_reply_since` son
 * el CONTRATO NUEVO de `GET /api/whatsapp/conversations` (otro agente lo
 * implementa en paralelo, task 3). Todos opcionales/nullable a propósito: si
 * ese endpoint todavía no los manda, el front no debe romperse — ver
 * `components/inbox/filters.ts` y `components/inbox/awaiting.ts`, que tratan
 * la ausencia como "sin etiqueta"/"no está esperando", nunca como error.
 */

/** Espejo de `lib/leads/tags.ts` `LeadTag`, pero solo lo que viaja por la API (sin id/sortOrder/isActive). */
export interface LeadTagRef {
  slug: string
  label: string
  color: string
}

/** Fila del catálogo completo — `GET /api/leads/tags`. */
export interface LeadTagCatalogEntry extends LeadTagRef {
  sort_order?: number
}

export interface ConversationListItem {
  phone_e164: string
  contact_name: string | null
  lead_id: string | null
  /** "#número de comprador" (migración 20260731000001) — null en conversaciones creadas antes de esa migración. */
  lead_number: number | null
  property_id: string | null
  property: { id: string; address: string; title: string | null } | null
  advisor_id: string | null
  advisor_name: string | null
  last_message: string | null
  last_direction: 'in' | 'out'
  last_status: string
  last_at: string
  unread_count: number
  /** Contrato nuevo (task 3) — puede no estar todavía. */
  pipeline_state?: string | null
  tags?: LeadTagRef[]
  assigned_to_name?: string | null
  awaiting_reply_since?: string | null
  /**
   * Contrato nuevo (task 4, `.superpowers/sdd/2026-08-03-agente-ia/`) — ventana
   * de 24hs RECALCULADA en cada fetch (`lib/integrations/whatsapp/window.ts`,
   * a partir del último entrante, esté o no contestado). `undefined` si el
   * endpoint todavía no lo manda; `components/inbox/filters.ts` lo trata igual
   * que ausente.
   */
  window?: { open: boolean; msRemaining: number } | null
  /**
   * Lectura acumulada de la IA (`conversation_ai_state`, la escribe
   * `lib/ai/analyze-conversation.ts` en paralelo) — `null` si esta conversación
   * TODAVÍA no fue analizada (no es "prioridad cero", es "no la miró la IA").
   */
  ai?: {
    intent: string
    priorityScore: number
    priorityReason: string | null
    suggestedNextStep: string | null
    analyzedAt: string | null
    /** `true` = el agente está apagado en ESTA conversación (a mano o por tope). */
    agentOff?: boolean
  } | null
  /**
   * Orden combinado (task 4) — `lib/integrations/whatsapp/priority.ts`
   * `computePriority(window, ai)`, calculado server-side en cada fetch.
   */
  priority?: { score: number; reason: string; windowUrgency: number; analyzed: boolean } | null
}

export interface ThreadMessage {
  id: string
  direction: 'in' | 'out'
  body_preview: string | null
  template_name: string | null
  status: string
  error_message: string | null
  sent_by: string | null
  created_at: string
  /** URL FIRMADA (1h) del bucket privado whatsapp-media — null si no hay adjunto o si la descarga desde Meta falló. */
  media_url: string | null
  media_mime_type: string | null
  media_filename: string | null
  media_type: string | null
}

export interface Thread {
  phone_e164: string
  contact_name: string | null
  lead: { id: string; name: string; lead_number: number | null } | null
  property: { id: string; address: string; title: string | null; cover_photo: string | null } | null
  window: { open: boolean; msRemaining: number }
  messages: ThreadMessage[]
}
