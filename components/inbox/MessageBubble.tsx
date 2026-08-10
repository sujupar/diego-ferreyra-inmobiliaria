'use client'

import { Check, CheckCheck, AlertTriangle, Clock, FileText, EyeOff } from 'lucide-react'
import { horaCorta, messageText, mediaCaption } from './format'
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
 *
 * SOBRE LOS COLORES: esto se dibuja ADENTRO de la burbuja saliente (verde), no
 * sobre el fondo del hilo. Los estados neutros van con `className` VACÍO a
 * propósito — heredan el `--chat-meta` del renglón, que es el gris ya medido
 * contra las dos burbujas. Un `text-muted-foreground` acá daba 4.27:1 contra
 * los 4.5:1 que pide AA. Y `Leído` usa `--chat-read` y no `text-blue-500`
 * (3.31:1 en claro, 3.72:1 en oscuro sobre el verde). Los mide
 * `contraste-burbuja.test.ts`; si mañana se agrega un estado con color propio,
 * el color va como token del chat y se suma a ese test.
 */
function outboundStatusMeta(status: string): { icon: typeof Check; label: string; className: string; isError: boolean } {
  switch (status) {
    case 'skipped':
      return { icon: Clock, label: 'Modo prueba — no se mandó de verdad', className: '', isError: false }
    case 'accepted':
    case 'sent':
      return { icon: Check, label: 'Enviado', className: '', isError: false }
    case 'delivered':
      return { icon: CheckCheck, label: 'Entregado', className: '', isError: false }
    case 'read':
      return { icon: CheckCheck, label: 'Leído', className: 'text-[color:var(--chat-read)]', isError: false }
    case 'failed':
      return { icon: AlertTriangle, label: 'No se pudo enviar', className: 'text-[color:var(--destructive)]', isError: true }
    default:
      return { icon: Clock, label: status, className: '', isError: false }
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
        {/* `max-w-full h-auto`: sin el tope de ancho, una foto apaisada se escala
            al alto máximo (256px) y se va a ~455px de ancho dentro de una burbuja
            que en un teléfono mide ~220px. Se derramaba sobre el hilo y, como el
            hilo es `overflow-y-auto` (lo que fuerza al eje X a `auto`), el chat
            entero ganaba scroll horizontal: al arrastrar para leer, se corría de
            costado. Es el caso MÁS común de todos — los clientes mandan fotos. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={message.media_url}
          alt={caption ?? 'Imagen recibida'}
          className="max-h-64 max-w-full rounded-lg object-cover h-auto"
        />
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
        <p className="mt-1 text-[11px] tabular-nums">{horaCorta(message.created_at)}</p>
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
      {/* `max-w-[85%]` en celular y 75% de `md:` para arriba: en un teléfono la
          columna del hilo mide ~356px y el 75% dejaba burbujas de ~245px con
          padding — una dirección o un precio con moneda se partían en tres
          renglones. En escritorio el 75% sigue siendo lo correcto (una línea de
          texto muy larga se vuelve incómoda de leer).

          La esquina del lado propio va a `rounded-br-md` (entrante:
          `rounded-bl-md`): es lo que le da al hilo la lectura de "quién habla"
          sin depender del color.

          Los colores salen de los tokens `--chat-*` de `app/globals.css`, que
          HOY apuntan exactamente a los valores de antes (crema/blanco/verde). El
          fondo crema y las burbujas verdes fueron un pedido explícito del dueño
          y el pedido posterior ("colores de marca, sin copiar WhatsApp") lo
          contradice: esa contradicción la resuelve él. Los tokens existen para
          que ese cambio sea tocar cuatro variables y no reescribir esto. */}
      <div
        className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-3 py-2 text-[15px] leading-[1.35] whitespace-pre-wrap break-words ${
          isOut ? 'rounded-br-md' : 'rounded-bl-md'
        } ${
          meta?.isError
            ? 'bg-[color:var(--destructive)]/10 border border-[color:var(--destructive)]/40 text-foreground'
            : isOut
              ? 'bg-[color:var(--chat-out-bg)] text-[color:var(--chat-out-fg)] shadow-sm'
              : 'bg-[color:var(--chat-in-bg)] text-[color:var(--chat-in-fg)] shadow-sm'
        }`}
      >
        {hasMedia ? media : messageText(message)}
        {/* La hora va ADENTRO de la burbuja, no debajo: afuera costaba un renglón
            entero por mensaje sobre un hilo que en un teléfono arrancaba con
            ~50px de alto. Y dice "14:32", no "hace 3 días": el hilo ya está
            agrupado por día con su separador, así que lo relativo era redundante
            y encima escondía el único dato que falta. */}
        {/* En la burbuja fallada el fondo es otro (`--destructive/10` sobre el
            crema del hilo, un durazno claro) y ahí `--chat-meta` da 3.92:1. El
            `text-foreground/70` da 6.84 en claro y 8.23 en oscuro, y se sigue
            leyendo como un dato secundario. */}
        <span className={`mt-1 flex items-center justify-end gap-1 text-[11px] tabular-nums ${
          meta?.isError ? 'text-foreground/70' : 'text-[color:var(--chat-meta)]'
        }`}>
          <span>{horaCorta(message.created_at)}</span>
          {isOut && StatusIcon && meta && (
            <span className={`flex items-center gap-0.5 ${meta.className}`}>
              <StatusIcon className="h-3 w-3" />
              {!meta.isError && meta.label}
            </span>
          )}
        </span>
      </div>
      {meta?.isError && (
        <p className="max-w-[85%] md:max-w-[75%] mt-0.5 px-1 text-xs font-medium text-[color:var(--destructive)]">
          No se pudo enviar: {message.error_message ?? 'WhatsApp no informó el motivo.'}
        </p>
      )}
    </div>
  )
}
