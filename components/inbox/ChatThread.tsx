'use client'

import type { RefObject } from 'react'
import { Clock, MessageCircle } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { formatDateSeparator, groupByDay } from './format'
import { resolveAwaitingSinceFromLastMessage, isAwaitingTooLong, waitingFor } from './awaiting'
import type { ThreadMessage } from './types'

/**
 * Franja de alerta (task 5): cuando el ÚLTIMO mensaje del hilo es del cliente
 * y pasó más de `AWAITING_ALERT_THRESHOLD_MS` sin que el equipo conteste. Se
 * calcula directo de `messages` — no depende de ningún campo nuevo de la API.
 */
function StaleReplyBanner({ messages }: { messages: ThreadMessage[] }) {
  const last = messages[messages.length - 1]
  const since = resolveAwaitingSinceFromLastMessage(last)
  if (!since || !isAwaitingTooLong(since)) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <Clock className="h-4 w-4 shrink-0" />
      El cliente escribió {waitingFor(since)} y todavía nadie le contestó.
    </div>
  )
}

/** Separador de día — "29 de julio de 2026" (task 5). */
function DateSeparator({ iso }: { iso: string }) {
  return (
    <div className="flex items-center justify-center py-1">
      <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">
        {formatDateSeparator(iso)}
      </span>
    </div>
  )
}

/**
 * El hilo (task 5): mensajes agrupados por día + la franja de alerta arriba.
 * Estética propia: fondo LISO (`bg-muted/20`, sin patrón), nada de verde
 * WhatsApp — las burbujas ya usan el azul de marca vía `MessageBubble`.
 */
export function ChatThread({ messages, endRef }: { messages: ThreadMessage[]; endRef: RefObject<HTMLDivElement | null> }) {
  const grouped = groupByDay(messages)

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/20">
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center gap-2 text-muted-foreground">
          <MessageCircle className="h-8 w-8" />
          <p className="text-sm">Todavía no hay mensajes en esta conversación.</p>
        </div>
      ) : (
        <>
          <StaleReplyBanner messages={messages} />
          {grouped.map(({ item: m, showSeparator }) => (
            <div key={m.id}>
              {showSeparator && <DateSeparator iso={m.created_at} />}
              <MessageBubble message={m} />
            </div>
          ))}
        </>
      )}
      <div ref={endRef} />
    </div>
  )
}
