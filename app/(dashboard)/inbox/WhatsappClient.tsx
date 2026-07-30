'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Loader2,
  MessageCircle,
  Send,
  ArrowLeft,
  Check,
  CheckCheck,
  AlertTriangle,
  Clock,
  Building2,
  Lock,
} from 'lucide-react'

const POLL_MS = 15000

// ── Tipos (espejo EXACTO del JSON documentado en task-6-report.md — no adivinar campos) ──
// Exportados para que el probe (`scripts/whatsapp-chat.probe.tsx`) pueda armar props a mano.

export interface ConversationListItem {
  phone_e164: string
  contact_name: string | null
  lead_id: string | null
  property_id: string | null
  property: { id: string; address: string; title: string | null } | null
  last_message: string | null
  last_direction: 'in' | 'out'
  last_status: string
  last_at: string
  unread_count: number
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
}

interface Thread {
  phone_e164: string
  contact_name: string | null
  lead: { id: string; name: string } | null
  property: { id: string; address: string; title: string | null } | null
  window: { open: boolean; msRemaining: number }
  messages: ThreadMessage[]
}

interface SendResponse {
  ok?: boolean
  skipped?: boolean
  messageId?: string | null
  error?: string
  window?: { open: boolean; msRemaining: number }
}

/**
 * Lee una respuesta HTTP tolerando que NO sea JSON (ej. un 502/504 de Netlify
 * devuelve HTML) — mismo patrón que `components/properties/LandingSection.tsx`,
 * requisito del brief para nunca mostrar el ilegible "Unexpected token '<'".
 */
async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    if (res.status === 504 || res.status === 502 || res.status === 408) {
      return { error: 'El servidor tardó demasiado y cortó la operación. Volvé a intentar.' } as never
    }
    return { error: `El servidor respondió algo inesperado (${res.status}). Volvé a intentar.` } as never
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'recién'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d} día${d > 1 ? 's' : ''}`
  return new Date(iso).toLocaleDateString('es-AR')
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0 min'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

function displayPhone(phoneE164: string): string {
  return `+${phoneE164}`
}

function initials(name: string | null, phone: string): string {
  if (name?.trim()) return name.trim().slice(0, 1).toUpperCase()
  return phone.slice(-2)
}

function messageText(m: { body_preview: string | null; template_name: string | null }): string {
  if (m.body_preview) return m.body_preview
  if (m.template_name) return `Plantilla: ${m.template_name}`
  return '(sin contenido)'
}

/** Metadata visual de estado — solo aplica a mensajes SALIENTES (los entrantes no tienen tilde). */
function outboundStatusMeta(status: string): { icon: typeof Check; label: string; className: string; isError: boolean } {
  switch (status) {
    case 'skipped':
      return { icon: Clock, label: 'Modo prueba — no se mandó de verdad', className: 'text-muted-foreground', isError: false }
    case 'accepted':
      return { icon: Clock, label: 'Enviando…', className: 'text-muted-foreground', isError: false }
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
 * Burbuja de un mensaje del hilo. Exportada como componente presentacional
 * aparte (en vez de quedar inline en el `.map` de `WhatsappClient`) para que
 * el probe de `scripts/whatsapp-chat.probe.tsx` pueda renderizarla con
 * `renderToStaticMarkup` pasándole un mensaje `failed` armado a mano — el
 * componente completo no se puede probar así porque los `useEffect` que
 * traen los datos reales (fetch) no corren fuera de un navegador.
 *
 * Requisito no negociable del brief: un mensaje `failed` tiene que mostrar el
 * motivo EN PANTALLA, en rojo, legible — nunca en tooltip ni solo en consola.
 */
export function MessageBubble({ message }: { message: ThreadMessage }) {
  const isOut = message.direction === 'out'
  const meta = isOut ? outboundStatusMeta(message.status) : null
  const StatusIcon = meta?.icon
  return (
    <div className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          meta?.isError
            ? 'bg-[color:var(--destructive)]/10 border border-[color:var(--destructive)]/40 text-foreground'
            : isOut
              ? 'bg-[color:var(--brand)] text-white'
              : 'bg-background border'
        }`}
      >
        {messageText(message)}
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

/** Fila de la lista de conversaciones — presentacional, misma razón de extracción que `MessageBubble`. */
export function ConversationRow({
  item,
  active,
  onSelect,
}: {
  item: ConversationListItem
  active: boolean
  onSelect: () => void
}) {
  const failedLast = item.last_status === 'failed' && item.last_direction === 'out'
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3 py-3 border-b transition hover:bg-muted/60 ${active ? 'bg-muted' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)]/15 text-[color:var(--brand)] text-sm font-semibold">
          {initials(item.contact_name, item.phone_e164)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm truncate">{item.contact_name ?? displayPhone(item.phone_e164)}</span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{relativeTime(item.last_at)}</span>
          </div>
          {item.property && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
              <Building2 className="h-3 w-3 shrink-0" />
              {item.property.address}
            </span>
          )}
          <div className="flex items-center justify-between gap-2 mt-0.5">
            {failedLast ? (
              <span className="flex items-center gap-1 text-xs font-medium text-[color:var(--destructive)] truncate">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                No se pudo enviar
              </span>
            ) : (
              <span className="text-xs text-muted-foreground truncate">
                {item.last_direction === 'out' ? 'Vos: ' : ''}
                {item.last_message ?? '(sin contenido)'}
              </span>
            )}
            {item.unread_count > 0 && (
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)] px-1 text-[10px] font-semibold text-white">
                {item.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

/** Banner de estado de la ventana de 24hs sobre la caja de respuesta — presentacional, mismo motivo de extracción. */
export function WindowNotice({ window }: { window: { open: boolean; msRemaining: number } }) {
  if (window.open) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Te quedan {formatRemaining(window.msRemaining)} para escribirle sin usar una plantilla.
      </p>
    )
  }
  return (
    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Lock className="h-3 w-3 shrink-0" />
      Pasaron más de 24hs desde que este contacto te escribió — WhatsApp no te deja mandarle texto libre. Para
      reabrir la conversación hace falta mandar una plantilla aprobada.
    </p>
  )
}

export function WhatsappClient({ userRole, userId }: { userRole: string; userId: string }) {
  const [conversations, setConversations] = useState<ConversationListItem[] | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [thread, setThread] = useState<Thread | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)

  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const conversationsRef = useRef<ConversationListItem[]>([])
  useEffect(() => {
    conversationsRef.current = conversations ?? []
  }, [conversations])

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setListLoading(true)
    try {
      const res = await fetch('/api/whatsapp/conversations')
      const data = await readJson<{ data?: ConversationListItem[] }>(res)
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron cargar las conversaciones.')
      setConversations(data.data ?? [])
      setListError(null)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Error al cargar las conversaciones')
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConversations()
    const handle = setInterval(() => {
      if (document.visibilityState === 'visible') loadConversations({ silent: true })
    }, POLL_MS)
    return () => clearInterval(handle)
  }, [loadConversations])

  // `loadThread` no depende de `conversations` en sus deps de useCallback (usa
  // el ref) para poder quedar ESTABLE — si dependiera de `conversations`, el
  // polling de la lista (cada 15s) recrearía la función y forzaría un refetch
  // del hilo en cada ciclo de la lista, no solo del propio hilo.
  const loadThread = useCallback(async (phone: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setThreadLoading(true)
    try {
      const item = conversationsRef.current.find(c => c.phone_e164 === phone)
      const params = new URLSearchParams()
      if (item?.lead_id) params.set('leadId', item.lead_id)
      if (item?.property_id) params.set('propertyId', item.property_id)
      const qs = params.toString()
      const res = await fetch(`/api/whatsapp/conversations/${phone}${qs ? `?${qs}` : ''}`)
      const data = await readJson<{ data?: Thread }>(res)
      if (!res.ok) {
        const msg =
          data.error === 'forbidden'
            ? 'No tenés acceso a esta conversación.'
            : data.error === 'not_found'
              ? 'Todavía no hay mensajes acá y no pudimos confirmar a qué lead o propiedad pertenece — abrila desde la ficha del lead o de la propiedad.'
              : (data.error ?? 'No se pudo cargar la conversación.')
        throw new Error(msg)
      }
      setThread(data.data ?? null)
      setThreadError(null)
    } catch (err) {
      setThread(null)
      setThreadError(err instanceof Error ? err.message : 'Error al cargar la conversación')
    } finally {
      setThreadLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedPhone) {
      setThread(null)
      setThreadError(null)
      return
    }
    loadThread(selectedPhone)
    const handle = setInterval(() => {
      if (document.visibilityState === 'visible') loadThread(selectedPhone, { silent: true })
    }, POLL_MS)
    return () => clearInterval(handle)
  }, [selectedPhone, loadThread])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [thread?.messages.length])

  async function handleSend() {
    if (!thread || !replyText.trim() || sending) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'text',
          phone: thread.phone_e164,
          text: replyText.trim(),
          leadId: thread.lead?.id ?? null,
          propertyId: thread.property?.id ?? null,
        }),
      })
      const data = await readJson<SendResponse>(res)
      if (!res.ok) {
        setSendError(data.error ?? 'No se pudo enviar el mensaje.')
        return
      }
      if (data.ok === false) {
        setSendError(data.error ?? 'WhatsApp rechazó el envío.')
      }
      setReplyText('')
      await loadThread(thread.phone_e164, { silent: true })
      await loadConversations({ silent: true })
    } catch {
      setSendError('No se pudo conectar con el servidor. Volvé a intentar.')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Mensajería</p>
        <h2 className="display text-2xl">WhatsApp</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {userRole === 'asesor'
            ? 'Los WhatsApp de tus propiedades: los que salen del sistema y las respuestas de los clientes.'
            : 'Todos los WhatsApp del equipo: los que salen del sistema y las respuestas de los clientes.'}
        </p>
      </div>

      <div className="grid md:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-320px)] min-h-[480px]">
        {/* Columna izquierda: lista de conversaciones. En mobile se oculta si ya hay una elegida. */}
        <Card className={`overflow-hidden p-0 ${selectedPhone ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
          <div className="flex-1 overflow-y-auto">
            {listLoading && !conversations ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : listError ? (
              <div className="p-4 text-sm text-[color:var(--destructive)]">{listError}</div>
            ) : !conversations || conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-2 px-4 py-14">
                <MessageCircle className="h-9 w-9 text-muted-foreground" />
                <p className="text-sm font-medium">Todavía no hay conversaciones de WhatsApp</p>
                <p className="text-xs text-muted-foreground max-w-[240px]">
                  Acá van a aparecer los WhatsApp que manda el sistema (recordatorios, confirmaciones) y las
                  respuestas de los clientes apenas entren.
                </p>
              </div>
            ) : (
              conversations.map(c => (
                <ConversationRow
                  key={c.phone_e164}
                  item={c}
                  active={selectedPhone === c.phone_e164}
                  onSelect={() => setSelectedPhone(c.phone_e164)}
                />
              ))
            )}
          </div>
        </Card>

        {/* Columna derecha: hilo de la conversación elegida. En mobile solo se ve si hay una elegida. */}
        <Card className={`overflow-hidden p-0 ${selectedPhone ? 'flex flex-col' : 'hidden md:flex md:flex-col'}`}>
          {!selectedPhone ? (
            <CardContent className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Elegí una conversación de la izquierda para ver el chat.
            </CardContent>
          ) : threadLoading && !thread ? (
            <CardContent className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          ) : threadError ? (
            <CardContent className="flex flex-1 flex-col items-start gap-3 py-6">
              <Button variant="ghost" size="sm" onClick={() => setSelectedPhone(null)} className="md:hidden -ml-2">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Button>
              <p className="text-sm text-[color:var(--destructive)]">{threadError}</p>
            </CardContent>
          ) : thread ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedPhone(null)} className="md:hidden -ml-1">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)]/15 text-[color:var(--brand)] text-sm font-semibold">
                  {initials(thread.contact_name, thread.phone_e164)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {thread.contact_name ?? displayPhone(thread.phone_e164)}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {displayPhone(thread.phone_e164)}
                    {thread.property && ` · ${thread.property.address}`}
                  </p>
                </div>
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/20">
                {thread.messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center gap-2 text-muted-foreground">
                    <MessageCircle className="h-8 w-8" />
                    <p className="text-sm">Todavía no hay mensajes en esta conversación.</p>
                  </div>
                ) : (
                  thread.messages.map(m => <MessageBubble key={m.id} message={m} />)
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Caja de respuesta */}
              <div className="border-t p-3 space-y-2">
                {sendError && <p className="text-xs font-medium text-[color:var(--destructive)]">{sendError}</p>}
                <WindowNotice window={thread.window} />
                <div className="flex items-end gap-2">
                  <Textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={!thread.window.open || sending}
                    placeholder={thread.window.open ? 'Escribí tu respuesta…' : 'Ventana cerrada — hace falta una plantilla'}
                    className="min-h-[44px] max-h-32"
                    rows={1}
                  />
                  <Button
                    type="button"
                    size="icon"
                    onClick={handleSend}
                    disabled={!thread.window.open || !replyText.trim() || sending}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
