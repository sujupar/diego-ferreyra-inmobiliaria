'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PropertyInfoDialog } from '@/components/inbox/PropertyInfoDialog'
import { TemplatePicker } from '@/components/inbox/TemplatePicker'
import { EmojiPicker } from '@/components/inbox/EmojiPicker'
import { ConversationFilterBar } from '@/components/inbox/ConversationFilterBar'
import { ConversationList } from '@/components/inbox/ConversationList'
import { ThreadHeader } from '@/components/inbox/ThreadHeader'
import { ThreadActionsBar } from '@/components/inbox/ThreadActionsBar'
import { ChatThread } from '@/components/inbox/ChatThread'
import { ContactPanel } from '@/components/inbox/ContactPanel'
import { formatRemaining } from '@/components/inbox/format'
import { filterConversations, DEFAULT_CONVERSATION_FILTERS } from '@/components/inbox/filters'
import { PIPELINE_STATES, PIPELINE_STATE_LABELS } from '@/lib/leads/tags'
import type { ConversationListItem, Thread, LeadTagRef, LeadTagCatalogEntry } from '@/components/inbox/types'
import { Loader2, Send, ArrowLeft, Lock, Info } from 'lucide-react'

// Re-exportados para que `scripts/whatsapp-chat.probe.tsx` (y cualquier otro
// caller viejo) sigan pudiendo importar los tipos desde acá — la forma real
// vive ahora en `components/inbox/types.ts`, compartida con el resto de la
// pantalla (task 4/5/6).
export type { ConversationListItem, ThreadMessage } from '@/components/inbox/types'

const POLL_MS = 15000

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

/** Banner de estado de la ventana de 24hs sobre la caja de respuesta — presentacional, exportado para el probe. */
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

/**
 * Aviso de que falta suscribir el webhook de WhatsApp en el panel de Meta. Se
 * muestra cuando, en TODA la base, no hay ni un solo mensaje entrante ni una
 * sola actualización de estado (`webhookNotSubscribedWarning` de
 * `GET /api/whatsapp/conversations`). Sin este aviso, el chat solo muestra
 * mensajes salientes pegados en "Enviado" para siempre y ninguna respuesta de
 * cliente — confuso sin explicación. Presentacional, exportado para el probe.
 */
export function WebhookWarningBanner() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <Info className="h-4 w-4 shrink-0 mt-0.5" />
      <p>
        Todavía no llegó ninguna respuesta de cliente ni confirmación de entrega — probablemente falta suscribir la
        URL del webhook en el panel de Meta (Configuración de WhatsApp → Webhooks). El envío de mensajes funciona
        igual; lo que falta es que las respuestas y los estados de entrega lleguen de vuelta acá.
      </p>
    </div>
  )
}

export function WhatsappClient({ userRole, userId }: { userRole: string; userId: string }) {
  const [conversations, setConversations] = useState<ConversationListItem[] | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [webhookWarning, setWebhookWarning] = useState(false)

  // Catálogo de etiquetas (contrato nuevo, task 3 — `GET /api/leads/tags`).
  // Se pide UNA vez al montar (no hace falta pollearlo, cambia poco) y de
  // forma tolerante: si el endpoint todavía no existe o falla, queda en []
  // y la pantalla funciona igual, solo sin filtro/editor de etiquetas.
  const [tagCatalog, setTagCatalog] = useState<LeadTagRef[]>([])

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [thread, setThread] = useState<Thread | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [contactPanelOpen, setContactPanelOpen] = useState(false)

  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [showPropertyInfo, setShowPropertyInfo] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)

  const conversationsRef = useRef<ConversationListItem[]>([])
  useEffect(() => {
    conversationsRef.current = conversations ?? []
  }, [conversations])

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setListLoading(true)
    try {
      const res = await fetch('/api/whatsapp/conversations')
      const data = await readJson<{ data?: ConversationListItem[]; webhookNotSubscribedWarning?: boolean }>(res)
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron cargar las conversaciones.')
      setConversations(data.data ?? [])
      setWebhookWarning(Boolean(data.webhookNotSubscribedWarning))
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

  // Catálogo de etiquetas: una sola vez. Tolerante — ver comentario del estado arriba.
  useEffect(() => {
    fetch('/api/leads/tags')
      .then(res => readJson<{ data?: LeadTagCatalogEntry[] }>(res).then(body => ({ res, body })))
      .then(({ res, body }) => {
        if (res.ok && Array.isArray(body.data)) setTagCatalog(body.data)
      })
      .catch(() => {
        /* best-effort — sin catálogo, la lista y el hilo se ven igual */
      })
  }, [])

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
    setContactPanelOpen(false)
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

  function insertEmoji(emoji: string) {
    setReplyText(t => t + emoji)
  }

  /**
   * Optimista: cuando el panel del cliente O la barra de acciones del hilo
   * (Ajuste 1, 2026-08-01 — `ThreadActionsBar`) cambian etiquetas, refleja el
   * cambio en la fila de la lista sin esperar al próximo poll (15s). Es el
   * MISMO callback para los dos lugares — fuente de verdad única, evita que
   * ContactPanel y ThreadActionsBar terminen con copias de `tags` que se
   * desincronizan entre sí.
   */
  function handleTagsChanged(leadId: string, tags: LeadTagRef[]) {
    setConversations(prev => (prev ? prev.map(c => (c.lead_id === leadId ? { ...c, tags } : c)) : prev))
  }

  /** Mismo criterio que `handleTagsChanged`, para el estado del embudo cambiado desde `ThreadActionsBar`. */
  function handleStateChanged(leadId: string, state: string) {
    setConversations(prev => (prev ? prev.map(c => (c.lead_id === leadId ? { ...c, pipeline_state: state } : c)) : prev))
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Filtros de la lista (Ajuste 2, 2026-08-01): el ESTADO vivía dentro de
  // `ConversationList` (apilado arriba de la lista). El dueño pidió subir los
  // controles a una franja horizontal de ancho completo por encima de las dos
  // columnas — para eso el estado tiene que vivir acá, el único ancestro común
  // de `ConversationFilterBar` (la franja) y `ConversationList` (que ahora
  // solo recibe la lista ya filtrada).
  // ─────────────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [onlyUnanswered, setOnlyUnanswered] = useState(false)
  const [filterPropertyId, setFilterPropertyId] = useState('all')
  const [filterAdvisorId, setFilterAdvisorId] = useState('all')
  const [filterTagSlug, setFilterTagSlug] = useState('all')
  const [filterPipelineState, setFilterPipelineState] = useState('all')

  const propertyOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of conversations ?? []) {
      if (c.property) map.set(c.property.id, c.property.address)
    }
    return [{ value: 'all', label: 'Todas las propiedades' }, ...Array.from(map, ([value, label]) => ({ value, label }))]
  }, [conversations])

  const advisorOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of conversations ?? []) {
      const name = c.assigned_to_name ?? c.advisor_name
      if (c.advisor_id && name) map.set(c.advisor_id, name)
    }
    return [{ value: 'all', label: 'Todos los asesores' }, ...Array.from(map, ([value, label]) => ({ value, label }))]
  }, [conversations])

  const tagOptions = useMemo(
    () => [{ value: 'all', label: 'Todas las etiquetas' }, ...tagCatalog.map(t => ({ value: t.slug, label: t.label }))],
    [tagCatalog],
  )

  const stateOptions = useMemo(
    () => [
      { value: 'all', label: 'Todos los estados' },
      ...PIPELINE_STATES.map(s => ({ value: s, label: PIPELINE_STATE_LABELS[s] })),
    ],
    [],
  )

  const visibleConversations = useMemo(
    () =>
      filterConversations(conversations ?? [], {
        ...DEFAULT_CONVERSATION_FILTERS,
        search,
        onlyUnread,
        onlyUnanswered,
        propertyId: filterPropertyId,
        advisorId: filterAdvisorId,
        tagSlug: filterTagSlug,
        pipelineState: filterPipelineState,
      }),
    [conversations, search, onlyUnread, onlyUnanswered, filterPropertyId, filterAdvisorId, filterTagSlug, filterPipelineState],
  )

  const filtersActive =
    onlyUnread ||
    onlyUnanswered ||
    filterPropertyId !== 'all' ||
    filterAdvisorId !== 'all' ||
    filterTagSlug !== 'all' ||
    filterPipelineState !== 'all' ||
    search.trim() !== ''

  // El item de la lista correspondiente al hilo abierto — de ahí salen las
  // etiquetas/estado/asesor enriquecidos (contrato de task 3), que el
  // endpoint del HILO (`/conversations/[phone]`) no trae.
  const activeListItem = useMemo(
    () => conversations?.find(c => c.phone_e164 === selectedPhone) ?? null,
    [conversations, selectedPhone],
  )
  const activeTags = activeListItem?.tags ?? []
  const activeAdvisorName = activeListItem?.assigned_to_name ?? activeListItem?.advisor_name ?? null
  const activePipelineState = activeListItem?.pipeline_state ?? null

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

      {webhookWarning && <WebhookWarningBanner />}

      {/* Ajuste 2 (2026-08-01): franja de filtros de ancho completo, arriba de las
          dos columnas — antes ocupaba espacio apilada arriba de la lista de chats. */}
      <ConversationFilterBar
        search={search}
        onSearchChange={setSearch}
        onlyUnanswered={onlyUnanswered}
        onToggleUnanswered={() => setOnlyUnanswered(v => !v)}
        onlyUnread={onlyUnread}
        onToggleUnread={() => setOnlyUnread(v => !v)}
        propertyOptions={propertyOptions}
        filterPropertyId={filterPropertyId}
        onPropertyChange={setFilterPropertyId}
        showAdvisorFilter={userRole !== 'asesor'}
        advisorOptions={advisorOptions}
        filterAdvisorId={filterAdvisorId}
        onAdvisorChange={setFilterAdvisorId}
        showTagFilter={tagCatalog.length > 0}
        tagOptions={tagOptions}
        filterTagSlug={filterTagSlug}
        onTagChange={setFilterTagSlug}
        stateOptions={stateOptions}
        filterPipelineState={filterPipelineState}
        onPipelineStateChange={setFilterPipelineState}
      />

      <div className="grid md:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-360px)] min-h-[440px]">
        {/* Columna izquierda: solo la lista de conversaciones (filtros ya subieron arriba). En mobile se oculta si ya hay una elegida. */}
        <Card className={`overflow-hidden p-0 ${selectedPhone ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
          <ConversationList
            conversations={conversations}
            visible={visibleConversations}
            filtersActive={filtersActive}
            loading={listLoading}
            error={listError}
            selectedPhone={selectedPhone}
            onSelectPhone={setSelectedPhone}
          />
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
              <ThreadHeader
                onBack={() => setSelectedPhone(null)}
                contactName={thread.contact_name}
                phone={thread.phone_e164}
                leadNumber={thread.lead?.lead_number ?? null}
                advisorName={activeAdvisorName}
                pipelineState={activePipelineState}
                tags={activeTags}
                property={thread.property}
                onOpenContact={() => setContactPanelOpen(true)}
              />

              {/* Acciones del hilo: enviar info de la propiedad + plantilla (ya existían) +
                  etiquetas + estado (Ajuste 1, 2026-08-01 — atajo sin abrir el panel del contacto). */}
              <ThreadActionsBar
                property={thread.property}
                onOpenPropertyInfo={() => setShowPropertyInfo(true)}
                onOpenTemplatePicker={() => setShowTemplatePicker(true)}
                lead={thread.lead}
                tags={activeTags}
                tagCatalog={tagCatalog}
                pipelineState={activePipelineState}
                onTagsChanged={handleTagsChanged}
                onStateChanged={handleStateChanged}
              />

              <ChatThread messages={thread.messages} endRef={messagesEndRef} />

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
                  <EmojiPicker onSelect={insertEmoji} />
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

              {thread.property && (
                <PropertyInfoDialog
                  open={showPropertyInfo}
                  onOpenChange={setShowPropertyInfo}
                  propertyId={thread.property.id}
                  phone={thread.phone_e164}
                  leadId={thread.lead?.id ?? null}
                  windowOpen={thread.window.open}
                  onSent={() => {
                    loadThread(thread.phone_e164, { silent: true })
                    loadConversations({ silent: true })
                  }}
                />
              )}
              <TemplatePicker
                open={showTemplatePicker}
                onOpenChange={setShowTemplatePicker}
                phone={thread.phone_e164}
                leadId={thread.lead?.id ?? null}
                propertyId={thread.property?.id ?? null}
                onSent={() => {
                  loadThread(thread.phone_e164, { silent: true })
                  loadConversations({ silent: true })
                }}
              />

              <ContactPanel
                open={contactPanelOpen}
                onOpenChange={setContactPanelOpen}
                phone={thread.phone_e164}
                contactName={thread.contact_name}
                lead={thread.lead}
                property={thread.property}
                pipelineState={activePipelineState}
                tags={activeTags}
                tagCatalog={tagCatalog}
                advisorName={activeAdvisorName}
                messages={thread.messages}
                onTagsChanged={handleTagsChanged}
              />
            </>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
