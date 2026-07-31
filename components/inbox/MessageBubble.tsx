'use client'

import { Check, CheckCheck, AlertTriangle, Clock, FileText } from 'lucide-react'
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

export function MessageBubble({ message }: { message: ThreadMessage }) {
  const isOut = message.direction === 'out'
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
