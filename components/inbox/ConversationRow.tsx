'use client'

import { AlertTriangle, Building2, Clock, Sparkles } from 'lucide-react'
import { Avatar } from './Avatar'
import { TagChipList } from './TagChip'
import { relativeTime, displayPhone } from './format'
import { resolveAwaitingSince, isAwaitingTooLong, waitingFor } from './awaiting'
import type { ConversationListItem } from './types'

/**
 * Fila de la lista de conversaciones (task 4) — estilo "Cota": avatar con
 * iniciales de color, nombre + #número, etiquetas de colores, asesor a
 * cargo, contador de no leídos en verde, y la señal visual más importante de
 * toda la pantalla: si el último mensaje es del cliente y nadie contestó, se
 * nota SIN tener que abrir el hilo.
 *
 * `showPriority` (Task 4, 2026-08-03, `.superpowers/sdd/2026-08-03-agente-ia/`):
 * default `false` a propósito — la fila en el orden normal (por última
 * actividad) queda BYTE A BYTE igual que antes, ver los checks del probe. Solo
 * cuando `WhatsappClient` tiene activo "Ventana por cerrar" u "Orden IA" pasa
 * `true`, y ahí aparece la línea de motivo que el brief pide como
 * NO NEGOCIABLE ("sin el porqué, nadie confía en el orden"). El ícono de
 * chispa distingue si la IA YA analizó esta conversación (violeta, sólido) o
 * todavía no la miró (gris, apagado) — una fila sin análisis nunca debe leerse
 * como "prioridad cero", sino como "todavía no la miró la IA".
 */
export function ConversationRow({
  item,
  active,
  onSelect,
  showPriority = false,
}: {
  item: ConversationListItem
  active: boolean
  onSelect: () => void
  showPriority?: boolean
}) {
  const failedLast = item.last_status === 'failed' && item.last_direction === 'out'
  const awaitingSince = resolveAwaitingSince(item)
  const awaitingTooLong = isAwaitingTooLong(awaitingSince)
  const advisorName = item.assigned_to_name ?? item.advisor_name ?? null
  const tags = item.tags ?? []
  const priority = showPriority ? item.priority : null

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3 py-3 border-b transition hover:bg-muted/60 ${active ? 'bg-muted' : ''} ${
        awaitingTooLong ? 'border-l-2 border-l-amber-500' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar name={item.contact_name ?? item.phone_e164} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 min-w-0">
              <span className="font-semibold text-sm truncate">{item.contact_name ?? displayPhone(item.phone_e164)}</span>
              {item.lead_number != null && (
                <span className="shrink-0 text-[10px] text-muted-foreground">#{item.lead_number}</span>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{relativeTime(item.last_at)}</span>
          </div>

          {item.property && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
              <Building2 className="h-3 w-3 shrink-0" />
              {item.property.address}
            </span>
          )}

          {tags.length > 0 && <TagChipList tags={tags} />}

          {priority && (
            <p
              className={`flex items-center gap-1 text-[10px] ${
                priority.analyzed ? 'text-violet-700 dark:text-violet-400' : 'text-muted-foreground'
              }`}
            >
              <Sparkles className={`h-3 w-3 shrink-0 ${priority.analyzed ? '' : 'opacity-40'}`} />
              <span className="truncate">
                {priority.reason}
                {!priority.analyzed && ' · todavía no la miró la IA'}
              </span>
              {priority.analyzed && (
                <span className="ml-auto shrink-0 rounded-full bg-violet-100 px-1.5 py-px text-[9px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                  {priority.score}
                </span>
              )}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            {failedLast ? (
              <span className="flex items-center gap-1 text-xs font-medium text-[color:var(--destructive)] truncate">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                No se pudo enviar
              </span>
            ) : awaitingSince ? (
              // Cualquier último mensaje del cliente sin responder se distingue
              // del resto (texto en negrita, no el gris apagado de "ya
              // contestado") — la escalada a ámbar es solo para cuando además
              // pasó demasiado tiempo (brief: "se marca visualmente" aplica
              // SIEMPRE que el cliente quedó esperando, no solo cuando ya es
              // grave).
              <span
                className={`flex items-center gap-1 text-xs font-medium truncate ${
                  awaitingTooLong ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'
                }`}
              >
                {awaitingTooLong && <Clock className="h-3 w-3 shrink-0" />}
                {item.last_message ?? '(sin contenido)'}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground truncate">
                {item.last_direction === 'out' ? 'Vos: ' : ''}
                {item.last_message ?? '(sin contenido)'}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              {advisorName && <span className="max-w-[72px] truncate text-[10px] text-muted-foreground">{advisorName}</span>}
              {item.unread_count > 0 && (
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
                  {item.unread_count}
                </span>
              )}
            </div>
          </div>

          {awaitingTooLong && (
            <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
              Esperando respuesta {waitingFor(awaitingSince!)}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}
