'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
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
import { urlDelChat, accionAlCerrar, PARAM_CHAT } from '@/components/inbox/chat-url'
import { useIsMobile } from '@/hooks/use-mobile'
import { filterConversations, DEFAULT_CONVERSATION_FILTERS } from '@/components/inbox/filters'
import { agenteApagadoEn, conAgenteMarcado } from '@/components/inbox/agente'
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

/**
 * Banner de estado de la ventana de 24hs sobre la caja de respuesta —
 * presentacional, exportado para el probe.
 *
 * Con la ventana CERRADA esto imprimía dos oraciones completas: a 11px en 356px
 * de ancho son ~5 renglones ≈ 75px fijos, sobre un hilo que en un teléfono ya
 * estaba en 50px. El asesor veía más párrafo explicativo que conversación.
 * Ahora es UNA línea que además es accionable —"una plantilla aprobada" es el
 * botón que abre el selector— y la explicación completa queda para los lectores
 * de pantalla y como tooltip, que es donde el detalle no le cuesta alto a nadie.
 */
export function WindowNotice({
  window: ventana,
  onOpenTemplatePicker,
}: {
  window: { open: boolean; msRemaining: number }
  onOpenTemplatePicker?: () => void
}) {
  if (ventana.open) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Te quedan {formatRemaining(ventana.msRemaining)} para escribirle sin usar una plantilla.
      </p>
    )
  }
  const explicacion =
    'Pasaron más de 24hs desde que este contacto te escribió y WhatsApp no deja mandarle texto libre; una plantilla aprobada reabre la conversación.'
  return (
    <p className="flex items-center gap-1 text-[11px] text-muted-foreground" title={explicacion}>
      <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        Pasaron 24hs — para escribirle, mandá{' '}
        <button
          type="button"
          onClick={onOpenTemplatePicker}
          className="font-medium text-foreground underline underline-offset-2"
        >
          una plantilla aprobada
        </button>
        .
      </span>
      <span className="sr-only">{explicacion}</span>
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

  // ─────────────────────────────────────────────────────────────────────────
  // La conversación abierta vive en la URL (`?tab=whatsapp&chat=<teléfono>`),
  // no en un `useState`. Motivo largo y armado de la URL: `chat-url.ts`. En una
  // frase: con `useState`, el gesto de volver del teléfono sacaba al usuario del
  // Inbox entero en vez de cerrar el chat, y un refresco (o el "tirar para
  // recargar" de Android) perdía la conversación.
  //
  // Se escribe con `window.history.pushState` y no con `router.push`: Next
  // parchea los métodos nativos de `history` y sincroniza `useSearchParams`
  // solo, sin ida y vuelta al servidor ni re-render del árbol de la ruta. Es el
  // mismo patrón que ya usa `InboxTabs` para leer `?lead=`.
  // ─────────────────────────────────────────────────────────────────────────
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const selectedPhone = searchParams.get(PARAM_CHAT)

  // Si el chat lo abrimos NOSOTROS (empujando una entrada de historial), el
  // botón de volver tiene que deshacer ESA entrada, así hace exactamente lo
  // mismo que el gesto del teléfono. Si se entró directo por URL (link
  // compartido, refresco), no hay nada nuestro que deshacer y un `back()`
  // sacaría al usuario de la aplicación.
  const empujamosLaEntrada = useRef(false)

  const abrirChat = useCallback(
    (phone: string) => {
      window.history.pushState(null, '', urlDelChat(pathname, window.location.search, phone))
      empujamosLaEntrada.current = true
    },
    [pathname],
  )

  const cerrarChat = useCallback(() => {
    if (accionAlCerrar(empujamosLaEntrada.current) === 'atras') {
      empujamosLaEntrada.current = false
      window.history.back()
      return
    }
    window.history.replaceState(null, '', urlDelChat(pathname, window.location.search, null))
  }, [pathname])

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
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const esMovil = useIsMobile()

  /** Deja el hilo mostrando el final, que es donde está la conversación viva. */
  const bajarAlFinal = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [])

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

  /**
   * Lo que corre al tirar de la lista hacia abajo. `silent` a propósito: el
   * indicador del gesto ya dice que está actualizando; prender además el
   * esqueleto de carga vaciaría la lista debajo del dedo.
   */
  const refrescarLista = useCallback(() => loadConversations({ silent: true }), [loadConversations])

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

  // QUIÉN BAJA EL HILO, y por qué ya no es este efecto.
  //
  // Antes, acá se bajaba al final ante CUALQUIER cambio en la cantidad de
  // mensajes. Eso arreglaba el chat que abría mostrando lo más viejo, pero traía
  // el problema contrario: el hilo se re-consulta cada 15 segundos, así que si
  // entraba un mensaje mientras el asesor leía para arriba —justo lo que uno
  // hace antes de contestar algo importante— el chat se le arrancaba de las
  // manos.
  //
  // La decisión de bajar o no bajar depende de DÓNDE está mirando el asesor, y
  // eso solo lo sabe el que tiene el scroller: `ChatThread` (ver `scroll-hilo.ts`).
  // Ahí adentro baja solo si ya estaba mirando el final, y si no, ofrece el
  // botón con el conteo de lo que entró.
  //
  // El caso de "abrir la conversación" queda cubierto por el `key` de más abajo:
  // cada teléfono monta su propio `ChatThread`, y un `ChatThread` recién montado
  // SIEMPRE arranca en el final. Eso cubre además el defecto viejo de pasar de
  // una conversación de 4 mensajes a otra de 4 (la longitud no cambiaba, el
  // efecto no corría y el chat abría en el mensaje más viejo).
  //
  // Lo que SÍ sigue viviendo acá es la bajada explícita ante una acción del
  // asesor: enfocar el campo (`onFocus`) y mandar un mensaje (`handleSend`).

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
      // El campo vuelve a una línea: si no, queda alto y vacío ocupando el lugar
      // del hilo hasta que el asesor escriba otra cosa.
      if (composerRef.current) composerRef.current.style.height = ''
      await loadThread(thread.phone_e164, { silent: true })
      // Mandar un mensaje SIEMPRE baja al final, aunque el asesor estuviera
      // leyendo para arriba: acaba de escribir algo y lo que quiere ver es su
      // propio mensaje saliendo, no el punto de la conversación donde estaba.
      // Va en el cuadro siguiente porque el hilo recién se repinta con el
      // mensaje nuevo después de este `await`.
      requestAnimationFrame(bajarAlFinal)
      await loadConversations({ silent: true })
    } catch {
      setSendError('No se pudo conectar con el servidor. Volvé a intentar.')
    } finally {
      setSending(false)
    }
  }

  /** Alto máximo del compositor: ~5 renglones. Más que eso le come el hilo. */
  const ALTO_MAXIMO_COMPOSITOR = 128

  /**
   * El campo crece de 1 a 5 líneas con lo que se escribe. Sin esto, un mensaje
   * de tres renglones se escribe mirando una ventanita de uno: no se puede
   * releer lo que uno mismo puso antes de mandarlo.
   */
  function ajustarAltoDelCompositor(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, ALTO_MAXIMO_COMPOSITOR)}px`
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // En el teléfono, Enter NO envía: la tecla de retorno hace salto de línea y
    // se manda con el botón. Es lo que hace cualquier app de mensajería, y lo
    // contrario significa que el asesor no puede escribir dos renglones sin
    // mandar el primero por accidente. El atajo se queda en escritorio, donde
    // existe Shift+Enter y hay un teclado de verdad.
    if (esMovil) return
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
  // Task 4 (2026-08-03): dos modos de orden MÁS, tratados como excluyentes
  // entre sí y con "Sin responder" (prender uno apaga los otros dos) — los
  // tres fuerzan un orden distinto al de "última actividad" y combinarlos no
  // tiene un significado claro para el asesor. Sí pueden convivir con
  // search/propiedad/asesor/etiqueta/estado (esos son filtros, no órdenes).
  const [onlyWindowClosing, setOnlyWindowClosing] = useState(false)
  const [onlyAiOrder, setOnlyAiOrder] = useState(false)

  function toggleUnanswered() {
    setOnlyUnanswered(v => {
      const next = !v
      if (next) {
        setOnlyWindowClosing(false)
        setOnlyAiOrder(false)
      }
      return next
    })
  }
  function toggleWindowClosing() {
    setOnlyWindowClosing(v => {
      const next = !v
      if (next) {
        setOnlyUnanswered(false)
        setOnlyAiOrder(false)
      }
      return next
    })
  }
  function toggleAiOrder() {
    setOnlyAiOrder(v => {
      const next = !v
      if (next) {
        setOnlyUnanswered(false)
        setOnlyWindowClosing(false)
      }
      return next
    })
  }

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
        onlyWindowClosing,
        onlyAiOrder,
        propertyId: filterPropertyId,
        advisorId: filterAdvisorId,
        tagSlug: filterTagSlug,
        pipelineState: filterPipelineState,
      }),
    [
      conversations,
      search,
      onlyUnread,
      onlyUnanswered,
      onlyWindowClosing,
      onlyAiOrder,
      filterPropertyId,
      filterAdvisorId,
      filterTagSlug,
      filterPipelineState,
    ],
  )

  const filtersActive =
    onlyUnread ||
    onlyUnanswered ||
    onlyWindowClosing ||
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
  const agenteApagado = agenteApagadoEn(conversations, selectedPhone)

  return (
    // Ajuste de altura (2026-08-01): este div YA NO trae su propio título — el
    // dueño pidió que "Mensajería / WhatsApp / ..." suba a la MISMA fila que
    // las pestañas Campañas/Consultas/WhatsApp, así que ahora vive en
    // `InboxTabs.tsx` (único lugar que conoce las 3 pestañas a la vez). Este
    // componente asume que su padre (`InboxTabs`, SOLO cuando la pestaña
    // activa es "whatsapp") es un `flex flex-col` de alto fijo con la fila de
    // pestañas arriba — por eso `flex-1 min-h-0` (se lleva TODO lo que sobra
    // del alto fijo del padre, no `h-full`, que ignoraría el lugar que ya
    // ocupa esa fila) combinado con `flex flex-col` para repartir ESE alto
    // entre la franja de filtros (tamaño fijo) y la grilla de columnas
    // (`flex-1` propio, más abajo), que es la que le pasa el resto al hilo.
    // Antes el scroll era de la PÁGINA entera; ahora el único que scrollea es
    // el hilo (`ChatThread`).
    <div className="flex flex-1 min-h-0 flex-col gap-2">
      {webhookWarning && <WebhookWarningBanner />}

      {/* Ajuste 2 (2026-08-01): franja de filtros de ancho completo, arriba de las
          dos columnas — antes ocupaba espacio apilada arriba de la lista de chats.

          Fase 1 del sistema móvil: con un chat ABIERTO en celular la franja no se
          renderiza. Vivía fuera de la grilla, así que se veía igual dentro del
          chat, y ahí no sirve para nada: el asesor está leyendo mensajes y arriba
          tiene "Todas las propiedades / Todos los asesores / Sin responder /
          Orden IA" comiéndose un cuarto de la pantalla. Junto con el bloque de
          pestañas y título (`InboxTabs`) son los ~300px que le faltaban al hilo.
          De `md:` para arriba no cambia nada. */}
      <div className={selectedPhone ? 'hidden shrink-0 md:block' : 'shrink-0'}>
        <ConversationFilterBar
          search={search}
          onSearchChange={setSearch}
          onlyUnanswered={onlyUnanswered}
          onToggleUnanswered={toggleUnanswered}
          onlyUnread={onlyUnread}
          onToggleUnread={() => setOnlyUnread(v => !v)}
          onlyWindowClosing={onlyWindowClosing}
          onToggleWindowClosing={toggleWindowClosing}
          onlyAiOrder={onlyAiOrder}
          onToggleAiOrder={toggleAiOrder}
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
      </div>

      {/* `flex-1 min-h-0` (antes `h-[calc(100vh-360px)]`, un número inventado que no
          correspondía a ningún alto real disponible): ahora este div SIEMPRE se
          lleva exactamente el alto que sobra dentro del contenedor de alto fijo
          que arma `InboxTabs`, sea cual sea. */}
      <div className="grid flex-1 min-h-0 md:grid-cols-[340px_1fr] gap-4">
        {/* Columna izquierda: solo la lista de conversaciones (filtros ya subieron arriba). En mobile se oculta si ya hay una elegida.
            `gap-0` pisa el `gap-6` por defecto de `Card` — acá solo hay un hijo, no hace nada, pero
            se deja explícito por simetría con la columna derecha (ver comentario ahí). */}
        <Card className={`min-h-0 gap-0 overflow-hidden p-0 ${selectedPhone ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
          <ConversationList
            conversations={conversations}
            visible={visibleConversations}
            filtersActive={filtersActive}
            loading={listLoading}
            error={listError}
            selectedPhone={selectedPhone}
            onSelectPhone={abrirChat}
            showPriority={onlyWindowClosing || onlyAiOrder}
            // Tirar hacia abajo para actualizar. La lista ya se refresca sola
            // cada 15 segundos, pero el gesto es el reflejo de cualquiera
            // parado frente a una lista de mensajes, y sin él el asesor no
            // tiene forma de decirle "fijate ahora".
            onRefresh={refrescarLista}
          />
        </Card>

        {/* Columna derecha: hilo de la conversación elegida. En mobile solo se ve si hay una elegida.
            `gap-0` es la mitad del arreglo del "espacio muerto": `Card` trae por defecto
            `gap-6` (24px) entre CADA hijo directo (cabecera, hilo, caja de respuesta) — sin
            pisarlo acá, esos 24px se sumaban TRES veces incluso después de fusionar la barra
            de acciones en la cabecera. */}
        {/* `max-md:rounded-none max-md:border-0 max-md:shadow-none`: en celular el
            hilo va A SANGRE. Dentro de una tarjeta con borde, sombra y 16px de
            aire a cada lado (el `p-4` del layout, que `InboxTabs` cancela con
            `-m-4`), el chat se leía como "una tarjeta con un chat adentro" y no
            como un chat — y esos 32px de ancho son justo lo que le falta a las
            burbujas. En `md:` la tarjeta queda igual que siempre. */}
        {/* `entrada-chat` (globals.css): al abrir un chat en celular, el hilo
            entra desde la derecha en 180ms. NO es decoración — es lo único que
            dice, sin texto, que se ENTRÓ en algo y que el camino de vuelta es
            hacia la izquierda; sin eso, lista y chat se reemplazan de golpe y se
            lee como una página que recargó. La clase se aplica solo con el chat
            abierto, así que la animación corre al abrir y nunca al cerrar, y la
            regla entera vive detrás de `prefers-reduced-motion: no-preference`
            y de un `max-width` — en escritorio no existe. */}
        <Card
          className={`min-h-0 gap-0 overflow-hidden p-0 max-md:rounded-none max-md:border-0 max-md:shadow-none ${
            selectedPhone ? 'entrada-chat flex flex-col' : 'hidden md:flex md:flex-col'
          }`}
        >
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
              <Button variant="ghost" size="sm" onClick={cerrarChat} className="md:hidden -ml-2">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Button>
              <p className="text-sm text-[color:var(--destructive)]">{threadError}</p>
            </CardContent>
          ) : thread ? (
            <>
              {/* Cabecera del contacto + acciones del hilo (enviar info de la propiedad,
                  plantilla, etiquetas, estado) FUSIONADAS en una sola fila (ajuste de altura,
                  2026-08-01, opción (a) del brief — ver comentario largo en `ThreadHeader.tsx`).
                  Antes eran dos filas separadas, cada una con su propio borde y padding: el
                  dueño lo describió como "un espacio muerto" entre el dato del cliente y los
                  chips de Propiedad/Plantilla/Etiquetas/Estado. `showStateChip={false}` porque
                  el chip de estado YA se muestra al lado del nombre, dentro de `ThreadHeader`. */}
              <ThreadHeader
                onBack={cerrarChat}
                contactName={thread.contact_name}
                phone={thread.phone_e164}
                leadNumber={thread.lead?.lead_number ?? null}
                advisorName={activeAdvisorName}
                pipelineState={activePipelineState}
                tags={activeTags}
                property={thread.property}
                onOpenContact={() => setContactPanelOpen(true)}
                actionsSlot={
                  <ThreadActionsBar
                    bare
                    showStateChip={false}
                    property={thread.property}
                    onOpenPropertyInfo={() => setShowPropertyInfo(true)}
                    onOpenTemplatePicker={() => setShowTemplatePicker(true)}
                    lead={thread.lead}
                    tags={activeTags}
                    tagCatalog={tagCatalog}
                    pipelineState={activePipelineState}
                    onTagsChanged={handleTagsChanged}
                    onStateChanged={handleStateChanged}
                    phoneE164={selectedPhone}
                    agentOff={agenteApagado}
                    onAgentToggled={(phone, activo) => setConversations(cs => conAgenteMarcado(cs, phone, activo))}
                  />
                }
              />

              {/* `key` por teléfono: cambiar de conversación MONTA un hilo
                  nuevo, y un hilo recién montado arranca en el último mensaje.
                  Sin esto habría que acordarse de resetear a mano la posición
                  del scroll y el contador de mensajes nuevos cada vez que se
                  cambia de chat — y ese olvido ya fue un defecto real (dos
                  conversaciones con la misma cantidad de mensajes abrían en el
                  mensaje más viejo). */}
              <ChatThread key={selectedPhone} messages={thread.messages} endRef={messagesEndRef} />

              {/* Caja de respuesta.
                  `shrink-0`: es hermano del hilo dentro de un contenedor de alto
                  fijo, y sin esto el flex la aplasta antes de dejar scrollear.
                  `pb-safe` (globals.css) = `max(0.75rem, env(safe-area-inset-bottom))`:
                  desde que el viewport es `viewport-fit=cover`, sin esto el
                  botón de enviar queda debajo de la barra de gestos del iPhone.
                  Va como `px-3 pt-3 pb-safe` y no como `p-3 pb-safe` porque
                  Tailwind no garantiza el orden entre una utilidad propia y una
                  suya: si `p-3` ganara, el área segura se perdería en silencio. */}
              <div className="shrink-0 border-t px-3 pt-3 pb-safe space-y-2">
                {sendError && <p className="text-xs font-medium text-[color:var(--destructive)]">{sendError}</p>}
                <WindowNotice window={thread.window} onOpenTemplatePicker={() => setShowTemplatePicker(true)} />
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={composerRef}
                    value={replyText}
                    onChange={e => {
                      setReplyText(e.target.value)
                      ajustarAltoDelCompositor(e.target)
                    }}
                    onKeyDown={handleKeyDown}
                    // Al enfocar sube el teclado: el contenedor mide `--app-vh`
                    // (viewport visual), así que se achica y el compositor queda
                    // pegado arriba del teclado. Falta lo último, que el hilo
                    // muestre el final y no el medio — dos intentos porque el
                    // alto nuevo llega después de la animación del teclado.
                    onFocus={() => {
                      bajarAlFinal()
                      window.setTimeout(bajarAlFinal, 300)
                    }}
                    disabled={!thread.window.open || sending}
                    placeholder={thread.window.open ? 'Escribí tu respuesta…' : 'Ventana cerrada — hace falta una plantilla'}
                    className="min-h-11 max-h-32"
                    rows={1}
                  />
                  <EmojiPicker onSelect={insertEmoji} />
                  <Button
                    type="button"
                    size="icon"
                    aria-label="Enviar el mensaje"
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
