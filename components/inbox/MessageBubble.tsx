'use client'

import { Check, CheckCheck, AlertTriangle, Clock, FileText, EyeOff } from 'lucide-react'
import { relativeTime, messageText, mediaCaption } from './format'
import type { ThreadMessage } from './types'

/**
 * Burbuja de un mensaje del hilo (task 5). Movida sin cambios de lógica desde
 * `WhatsappClient.tsx` (rediseño visual + reorganización de archivos, no una
 * reescritura) — sigue siendo un componente presentacional puro para que
 * `scripts/whatsapp-chat.probe.tsx` la siga renderizando con
 * `renderToStaticMarkup`.
 *
 * Requisito NO NEGOCIABLE del brief: un mensaje `failed` tiene que mostrar el
 * motivo EN PANTALLA, en rojo, legible — nunca en tooltip ni solo en consola.
 * Eso NO cambia con el ajuste de abajo.
 *
 * Estética (Ajuste 3, 2026-08-01 — REEMPLAZA la decisión de task 5): acá
 * decía "estética propia, fondo liso, azul de marca en vez de verde
 * WhatsApp". El dueño vio el resultado y pidió lo contrario con una
 * referencia tipo WhatsApp: burbujas entrantes BLANCAS con sombra suave,
 * salientes VERDE CLARITO. Se manda lo que pide el usuario ahora — el fallo
 * (`meta.isError`) sigue pisando cualquier otro color, siempre en rojo.
 */

/**
 * Toda fila SALIENTE cuyo status arranca con `agent_` es una NOTA INTERNA que
 * escribió el agente de IA (`AGENT_NOTE_STATUS_PREFIX` en
 * `lib/ai/scheduling-agent.ts`) y que NUNCA se le mandó al cliente por WhatsApp.
 *
 * El criterio es el PREFIJO, no una lista, y eso es lo que arregla el bug: acá
 * había cuatro status copiados a mano mientras el agente ya definía seis, así
 * que `agent_visit_lookup_failed` y `agent_propose_unsent` caían en el `default`
 * de `outboundStatusMeta` — se leía el string crudo en pantalla y la fila se
 * pintaba con el MISMO verde de un mensaje enviado, o sea que un asesor daba
 * por hecho que al cliente se le había mandado algo que nunca salió. Con el
 * prefijo, un séptimo status del agente ya queda bien tratado el día que se
 * agregue.
 *
 * El motivo en prosa es copia de UI (lo lee un asesor, no un programador) y por
 * eso vive acá; el fallback cubre a los status que todavía no tengan uno propio.
 * No se importan las constantes de `scheduling-agent.ts` porque este componente
 * es `'use client'` y ese módulo arrastra Supabase y la cadena de mails
 * (`import 'server-only'`) al bundle del navegador. El contrato se sostiene
 * desde los tests, uno de cada lado: `MessageBubble.test.tsx` prueba que
 * CUALQUIER `agent_*` se dibuje como nota interna, y `scheduling-agent.test.ts`
 * que todo status que el agente escriba arranque con ese prefijo.
 */
const AGENT_NOTE_STATUS_PREFIX = 'agent_'

const AGENT_NOTE_REASONS: Record<string, string> = {
  agent_handoff: 'el agente de IA dejó de escribir, sigue una persona',
  agent_visit_pending: 'ya hay una visita propuesta sin confirmar',
  agent_visit_failed: 'no se pudo registrar la visita',
  agent_visit_unconfirmed: 'la visita quedó registrada pero falta confirmársela al cliente',
  agent_visit_lookup_failed: 'no se pudo verificar si ya había una visita anotada',
  agent_propose_unsent: 'no se le pudieron mandar las opciones de día',
}

const AGENT_NOTE_REASON_FALLBACK = 'aviso del agente de IA para el equipo'

/** El motivo a mostrar, o `undefined` si esta fila NO es una nota interna. */
function agentNoteReason(status: string): string | undefined {
  if (!status.startsWith(AGENT_NOTE_STATUS_PREFIX)) return undefined
  return AGENT_NOTE_REASONS[status] ?? AGENT_NOTE_REASON_FALLBACK
}

/**
 * Metadata visual de estado — solo aplica a mensajes SALIENTES (los entrantes
 * no tienen tilde).
 *
 * `'accepted'` (Meta ya lo aceptó, es el estado inicial de TODO envío real)
 * muestra el mismo tilde simple que `'sent'` — "Enviando…" sería deshonesto:
 * ese mensaje YA SALIÓ. La única razón por la que hoy se queda pegado en
 * `accepted` para siempre es que el webhook de estados de Meta no está
 * suscripto (ver `WebhookWarningBanner`), no que el envío siga en curso.
 */
function outboundStatusMeta(status: string): { icon: typeof Check; label: string; className: string; isError: boolean } {
  switch (status) {
    case 'skipped':
      return { icon: Clock, label: 'Modo prueba — no se mandó de verdad', className: 'text-muted-foreground', isError: false }
    case 'accepted':
    case 'sent':
      return { icon: Check, label: 'Enviado', className: 'text-muted-foreground', isError: false }
    case 'delivered':
      return { icon: CheckCheck, label: 'Entregado', className: 'text-muted-foreground', isError: false }
    case 'read':
      return { icon: CheckCheck, label: 'Leído', className: 'text-blue-500', isError: false }
    case 'failed':
      return { icon: AlertTriangle, label: 'No se pudo enviar', className: 'text-[color:var(--destructive)]', isError: true }
    default:
      return { icon: Clock, label: status, className: 'text-muted-foreground', isError: false }
  }
}

/**
 * Contenido multimedia de un mensaje entrante. Si `media_url` es null (sin
 * adjunto, o la descarga desde Meta falló) devuelve `null` — el caller cae al
 * texto plano de `messageText()`.
 */
function MediaContent({ message }: { message: ThreadMessage }) {
  if (!message.media_url) return null
  const mime = message.media_mime_type ?? ''
  const caption = mediaCaption(message.body_preview)

  if (mime.startsWith('image/')) {
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={message.media_url} alt={caption ?? 'Imagen recibida'} className="max-h-64 rounded-lg object-cover" />
        {caption && <p className="mt-1 text-sm">{caption}</p>}
      </div>
    )
  }
  if (mime.startsWith('audio/')) {
    return <audio controls src={message.media_url} className="max-w-full" />
  }
  if (mime.startsWith('video/')) {
    return (
      <div>
        <video controls src={message.media_url} className="max-h-64 max-w-full rounded-lg" />
        {caption && <p className="mt-1 text-sm">{caption}</p>}
      </div>
    )
  }
  // Documento (o cualquier mime no contemplado): link de descarga con el nombre real.
  return (
    <a
      href={message.media_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md border border-current/20 px-2 py-1.5 text-sm underline"
    >
      <FileText className="h-4 w-4 shrink-0" />
      {message.media_filename ?? 'Descargar archivo'}
    </a>
  )
}

/**
 * Nota interna del equipo. Se dibuja CENTRADA y en gris, con el lenguaje visual
 * de los avisos del hilo (el separador de fecha y la franja de demora de
 * `ChatThread`), nunca con la burbuja verde de un saliente: de un vistazo tiene
 * que quedar claro que esto no es una conversación con el cliente, sino un
 * cartel para el asesor. Sobrio a propósito — el hilo ya tiene bastante color.
 */
function InternalNote({ message, reason }: { message: ThreadMessage; reason: string }) {
  return (
    <div className="flex justify-center">
      <div className="max-w-[85%] rounded-lg border border-dashed border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <p className="flex items-start gap-1.5 font-medium text-foreground/80">
          <EyeOff className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>Nota interna del equipo — el cliente no la vio ({reason}).</span>
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words">{messageText(message)}</p>
        <p className="mt-1 text-[10px]">{relativeTime(message.created_at)}</p>
      </div>
    </div>
  )
}

export function MessageBubble({ message }: { message: ThreadMessage }) {
  const isOut = message.direction === 'out'
  // Antes que cualquier otra cosa: una nota interna no es un mensaje del chat.
  const noteReason = isOut ? agentNoteReason(message.status) : undefined
  if (noteReason) return <InternalNote message={message} reason={noteReason} />
  const meta = isOut ? outboundStatusMeta(message.status) : null
  const StatusIcon = meta?.icon
  const media = <MediaContent message={message} />
  const hasMedia = message.media_url != null
  return (
    <div className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          meta?.isError
            ? 'bg-[color:var(--destructive)]/10 border border-[color:var(--destructive)]/40 text-foreground'
            : isOut
              ? 'bg-emerald-100 text-emerald-950 shadow-sm dark:bg-emerald-900/50 dark:text-emerald-50'
              : 'bg-white text-foreground shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
        }`}
      >
        {hasMedia ? media : messageText(message)}
      </div>
      <div className="flex items-center gap-1 mt-1 px-1">
        <span className="text-[10px] text-muted-foreground">{relativeTime(message.created_at)}</span>
        {isOut && StatusIcon && meta && (
          <span className={`flex items-center gap-0.5 text-[10px] ${meta.className}`}>
            <StatusIcon className="h-3 w-3" />
            {!meta.isError && meta.label}
          </span>
        )}
      </div>
      {meta?.isError && (
        <p className="max-w-[75%] mt-0.5 px-1 text-xs font-medium text-[color:var(--destructive)]">
          No se pudo enviar: {message.error_message ?? 'WhatsApp no informó el motivo.'}
        </p>
      )}
    </div>
  )
}
