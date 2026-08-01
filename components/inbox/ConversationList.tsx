'use client'

import { Loader2, MessageCircle, AlertCircle } from 'lucide-react'
import { ConversationRow } from './ConversationRow'
import type { ConversationListItem } from './types'

/**
 * Columna izquierda (task 4, recortada en el Ajuste 2 de 2026-08-01): SOLO la
 * lista de conversaciones. Los filtros (buscador, "Sin responder", "No
 * leídas", propiedad, asesor, etiqueta, estado) vivían acá apilados arriba de
 * la lista — el dueño pidió subirlos a una franja horizontal de ancho
 * completo por encima de las dos columnas (ver `ConversationFilterBar` +
 * `WhatsappClient.tsx`, que ahora es dueño del estado de filtros y le pasa acá
 * la lista YA filtrada).
 *
 * `conversations` (la lista CRUDA, sin filtrar) se sigue recibiendo para
 * distinguir "todavía no hay ninguna conversación" de "hay conversaciones
 * pero ningún resultado con los filtros actuales" — dos estados vacíos
 * distintos que necesitan mensajes distintos.
 */
export function ConversationList({
  conversations,
  visible,
  filtersActive,
  loading,
  error,
  selectedPhone,
  onSelectPhone,
  showPriority = false,
}: {
  /** Lista completa, sin filtrar — solo para distinguir los estados vacíos. */
  conversations: ConversationListItem[] | null
  /** Lista ya filtrada (por `WhatsappClient`) — lo que se renderiza. */
  visible: ConversationListItem[]
  filtersActive: boolean
  loading: boolean
  error: string | null
  selectedPhone: string | null
  onSelectPhone: (phone: string) => void
  /** Task 4 — true mientras "Ventana por cerrar" u "Orden IA" está activo: muestra el motivo del orden en cada fila. */
  showPriority?: boolean
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {loading && !conversations ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 p-4 text-sm text-[color:var(--destructive)]">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      ) : !conversations || conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-2 px-4 py-14">
          <MessageCircle className="h-9 w-9 text-muted-foreground" />
          <p className="text-sm font-medium">Todavía no hay conversaciones de WhatsApp</p>
          <p className="text-xs text-muted-foreground max-w-[240px]">
            Acá van a aparecer los WhatsApp que manda el sistema (recordatorios, confirmaciones) y las respuestas de
            los clientes apenas entren.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-2 px-4 py-14">
          <p className="text-sm text-muted-foreground">
            {filtersActive ? 'Ningún resultado con estos filtros.' : 'Ningún resultado.'}
          </p>
        </div>
      ) : (
        visible.map(c => (
          <ConversationRow
            key={c.phone_e164}
            item={c}
            active={selectedPhone === c.phone_e164}
            onSelect={() => onSelectPhone(c.phone_e164)}
            showPriority={showPriority}
          />
        ))
      )}
    </div>
  )
}
