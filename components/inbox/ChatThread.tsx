'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronDown, Clock, MessageCircle } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { formatDateSeparator, groupByDay } from './format'
import { isAwaitingTooLong, waitingFor } from './awaiting'
import { resolveThreadAwaitingSince } from './thread-metrics'
import { estaCercaDelFinal, nuevosSinVer, debeBajarSolo } from './scroll-hilo'
import type { ThreadMessage } from './types'

/**
 * Franja de alerta (task 5): cuando el cliente escribió y pasó más de
 * `AWAITING_ALERT_THRESHOLD_MS` sin que el equipo conteste. Se calcula directo
 * de `messages` — no depende de ningún campo nuevo de la API.
 *
 * Mira el HILO ENTERO (`resolveThreadAwaitingSince`), no solo el último
 * mensaje. Con "solo el último" alcanzaba con que el agente de IA dejara su
 * nota interna (`agent_handoff` y compañía) o con que un envío rebotara para
 * que el reloj arrancara desde ESA fila nuestra: la franja anunciaba "el
 * cliente escribió hace instantes" —o no aparecía— cuando en realidad el
 * cliente estaba esperando hace horas. La franja existe justamente para gritar
 * ese número; no puede subestimarlo.
 */
function StaleReplyBanner({ messages }: { messages: ThreadMessage[] }) {
  const since = resolveThreadAwaitingSince(messages)
  if (!since || !isAwaitingTooLong(since)) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <Clock className="h-4 w-4 shrink-0" />
      El cliente escribió {waitingFor(since)} y todavía nadie le contestó.
    </div>
  )
}

/**
 * Separador de día — "29 de julio de 2026" (task 5). Píldora centrada: a 10px
 * era casi ilegible a un brazo de distancia en un teléfono, y ahora es el ÚNICO
 * lugar donde se lee la fecha (la burbuja pasó a mostrar solo la hora).
 */
function DateSeparator({ iso }: { iso: string }) {
  return (
    <div className="flex items-center justify-center py-1">
      <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
        {formatDateSeparator(iso)}
      </span>
    </div>
  )
}

/**
 * "Bajar al último mensaje". Solo aparece cuando el asesor se fue para arriba
 * — que es justo cuando el hilo dejó de bajar solo y, sin este botón, volver al
 * presente sería un arrastre a ciegas de varios días de conversación.
 *
 * Si mientras tanto entró algo, lo dice con el número: el botón deja de ser
 * "volvé abajo" y pasa a ser "hay 2 mensajes que no viste", que es la
 * información que hace falta para decidir si vale la pena volver.
 */
function BotonBajar({ nuevos, onBajar }: { nuevos: number; onBajar: () => void }) {
  const etiqueta = nuevos > 0
    ? `Bajar a los ${nuevos} mensajes nuevos`
    : 'Bajar al último mensaje'
  return (
    <button
      type="button"
      onClick={onBajar}
      aria-label={etiqueta}
      title={etiqueta}
      // `absolute` sobre el envoltorio (no sobre el scroller): así se queda
      // quieto arriba del compositor mientras el hilo se mueve por detrás.
      className="tap absolute right-3 bottom-3 z-10 flex items-center justify-center gap-1 rounded-full border bg-card px-3 shadow-lg"
    >
      <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      {nuevos > 0 && (
        <span className="min-w-4 text-center text-xs font-semibold tabular-nums">{nuevos}</span>
      )}
    </button>
  )
}

/**
 * El hilo (task 5): mensajes agrupados por día + la franja de alerta arriba.
 *
 * Estética (Ajuste 3, 2026-08-01 — REEMPLAZA la decisión original): el brief
 * de esta tarea decía "estética propia, NO WhatsApp, fondo liso". El dueño
 * vio esa pantalla y pidió explícitamente lo contrario, mostrando una
 * referencia tipo WhatsApp ("el de verdecito"): fondo crema/beige con textura
 * de puntitos sutil. Se manda lo que pide el usuario ahora — fondo con
 * textura vía `wa-thread-bg` (`app/globals.css`), un `radial-gradient` CSS
 * puro, SIN imagen ni dependencia nueva (decisión ya tomada en el brief). Las
 * burbujas (blanco entrante / verde clarito saliente) están en
 * `MessageBubble.tsx`.
 */
export function ChatThread({ messages, endRef }: { messages: ThreadMessage[]; endRef: RefObject<HTMLDivElement | null> }) {
  const grouped = groupByDay(messages)

  // ───────────────────────────────────────────────────────────────────────────
  // Bajar solo, pero no siempre (ver `scroll-hilo.ts`). El hilo se re-consulta
  // cada 15 segundos: hasta ahora CUALQUIER mensaje nuevo lo mandaba al final,
  // aunque el asesor estuviera releyendo algo de tres días atrás. Ahora baja
  // solo si ya estaba mirando el final; si no, el mensaje entra sin moverle la
  // pantalla y aparece el botón con el conteo.
  //
  // El estado arranca en "está mirando el final" a propósito: con eso, el primer
  // dibujo (y el del servidor) NO muestra el botón, y la conversación recién
  // abierta se comporta como siempre.
  // ───────────────────────────────────────────────────────────────────────────
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [cerca, setCerca] = useState(true)
  const [nuevos, setNuevos] = useState(0)
  const cantidadAnterior = useRef<number | null>(null)

  const bajar = useCallback((suave: boolean) => {
    const el = scrollerRef.current
    if (!el) return
    const quieto =
      suave &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: suave && !quieto ? 'smooth' : 'auto' })
  }, [])

  function alScrollear() {
    const el = scrollerRef.current
    if (!el) return
    const ahoraCerca = estaCercaDelFinal(el)
    setCerca(ahoraCerca)
    if (ahoraCerca) setNuevos(0)
  }

  useEffect(() => {
    const anterior = cantidadAnterior.current
    cantidadAnterior.current = messages.length
    const primeraPintura = anterior === null
    const llegaron = primeraPintura ? 0 : messages.length - anterior
    if (!primeraPintura && llegaron <= 0) return
    if (debeBajarSolo(primeraPintura, cerca)) {
      bajar(false)
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el contador es acumulativo; no se puede derivar de las props
    setNuevos(n => nuevosSinVer(n, llegaron))
  }, [messages.length, cerca, bajar])

  return (
    /*
      Envoltorio SIN scroll: existe solo para que el botón de bajar quede
      anclado a la ventana del hilo en vez de irse con el contenido. El que
      scrollea sigue siendo UNO solo, el de adentro.
    */
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/*
        `scroll-pane` (globals.css) = `overflow-y:auto` + `overscroll-behavior:
        contain`: el gesto que llega al final del hilo NO se le contagia a la
        página, así que se termina el rebote de iOS y el "tirar para recargar" de
        Android desde adentro del chat (que hoy pierde la conversación abierta).

        `overflow-x-hidden` es red de seguridad: un adjunto ancho o un token sin
        espacios no puede hacer que el hilo scrollee de costado.

        `px-3` en celular (en vez de 16px a cada lado) son 8px más de burbuja, que
        es justo lo que le falta a una dirección para entrar en un renglón.

        NO lleva `min-h`: el contenedor mide `--app-vh`, así que cuando sube el
        teclado el hilo tiene que PODER achicarse. Un piso en `vh` lo empujaría
        contra el compositor y lo mandaría fuera de cuadro — justo lo contrario de
        lo que estamos arreglando.
      */}
      <div
        ref={scrollerRef}
        data-slot="hilo-scroller"
        onScroll={alScrollear}
        className="wa-thread-bg scroll-pane min-h-0 flex-1 overflow-x-hidden px-3 py-4 space-y-3 md:px-4"
      >
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

      {!cerca && <BotonBajar nuevos={nuevos} onBajar={() => { setNuevos(0); setCerca(true); bajar(true) }} />}
    </div>
  )
}
