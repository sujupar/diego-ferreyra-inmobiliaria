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
  const sinLeer = item.unread_count > 0

  return (
    // La fila ENTERA es el disparador (un `<button>` de ancho completo), no el
    // nombre ni el avatar: con el pulgar, cualquier punto de la fila abre el
    // chat. `max-md:min-h-16` es el piso táctil — una fila sin propiedad, sin
    // etiquetas y sin nombre largo se quedaba en ~52px.
    <button
      type="button"
      onClick={onSelect}
      className={`w-full max-md:min-h-16 text-left px-3 py-3 border-b transition hover:bg-muted/60 ${active ? 'bg-muted' : ''} ${
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
            {/* Con mensajes sin leer, la hora se pinta del mismo verde que el
                contador: en celular, donde la fila entra apenas y el contador
                queda abajo a la derecha, es la señal que se ve de reojo
                bajando la lista. En `md:` para arriba no cambia nada.

                `emerald-700` y no `-600`: a 10px semibold la norma pide 4.5 de
                contraste, y el 600 da 3.67 sobre la tarjeta y 3.26 sobre la
                fila activa. El 700 da 5.37 y 4.78, y se sigue leyendo como el
                mismo verde de "sin leer". En oscuro el 400 ya daba 9.73. */}
            <span
              className={`text-[10px] whitespace-nowrap ${
                sinLeer ? 'text-muted-foreground max-md:font-semibold max-md:text-emerald-700 max-md:dark:text-emerald-400' : 'text-muted-foreground'
              }`}
            >
              {relativeTime(item.last_at)}
            </span>
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
              // Con mensajes sin leer, el adelanto deja de ser gris apagado: es
              // la diferencia entre "ya lo leí" y "esto está esperando". Solo en
              // celular, donde no hay lugar para más señales que el peso del texto.
              <span
                className={`text-xs truncate ${
                  sinLeer ? 'text-muted-foreground max-md:font-medium max-md:text-foreground' : 'text-muted-foreground'
                }`}
              >
                {item.last_direction === 'out' ? 'Vos: ' : ''}
                {item.last_message ?? '(sin contenido)'}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              {advisorName && <span className="max-w-[72px] truncate text-[10px] text-muted-foreground">{advisorName}</span>}
              {sinLeer && (
                // `aria-label`: sin él, un lector de pantalla lee "3" suelto al
                // final de la fila y no hay forma de saber 3 de qué.
                <span
                  aria-label={`${item.unread_count} sin leer`}
                  className="inline-flex h-5 min-w-5 max-md:h-6 max-md:min-w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] max-md:text-xs font-semibold text-white"
                >
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
