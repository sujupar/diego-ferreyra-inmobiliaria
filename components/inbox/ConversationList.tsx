'use client'

import { ArrowDown, Loader2, MessageCircle, AlertCircle } from 'lucide-react'
import { ConversationRow } from './ConversationRow'
import {
  useTirarParaActualizar,
  DISTANCIA_PARA_SOLTAR,
  type EstadoDelTiron,
} from '@/hooks/use-tirar-para-actualizar'
import type { ConversationListItem } from './types'

/**
 * El indicador del "tirar para actualizar". Va anclado al ENVOLTORIO (no al
 * scroller) y baja acompañando al dedo: mientras el gesto no llega al umbral la
 * flecha mira para abajo, al llegar se da vuelta —"soltá"— y mientras se
 * actualiza gira.
 *
 * `aria-hidden`: el estado ya se anuncia con `aria-busy` en la lista; leer
 * "flecha" a mitad de un gesto no le sirve a nadie.
 */
function IndicadorDeTiron({ distancia, estado }: { distancia: number; estado: EstadoDelTiron }) {
  if (estado === 'inactivo') return null
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
      style={{ transform: `translateY(${Math.max(0, distancia - 36)}px)` }}
    >
      <span className="flex size-8 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md">
        {estado === 'refrescando' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowDown
            className={`h-4 w-4 transition-transform duration-150 ${estado === 'soltar' ? 'rotate-180' : ''}`}
          />
        )}
      </span>
    </div>
  )
}

/**
 * Columna izquierda (task 4, recortada en el Ajuste 2 de 2026-08-01): SOLO la
 * lista de conversaciones. Los filtros (buscador, "Sin responder", "No
 * leídas", propiedad, asesor, etiqueta, estado) vivían acá apilados arriba de
 * la lista — el dueño pidió subirlos a una franja horizontal de ancho
 * completo por encima de las dos columnas (ver `ConversationFilterBar` +
 * `WhatsappClient.tsx`, que ahora es dueño del estado de filtros y le pasa acá
 * la lista YA filtrada).
 *
 * `conversations` (la lista CRUDA, sin filtrar) se sigue recibiendo para
 * distinguir "todavía no hay ninguna conversación" de "hay conversaciones
 * pero ningún resultado con los filtros actuales" — dos estados vacíos
 * distintos que necesitan mensajes distintos.
 */
export function ConversationList({
  conversations,
  visible,
  filtersActive,
  loading,
  error,
  selectedPhone,
  onSelectPhone,
  showPriority = false,
  onRefresh,
}: {
  /** Lista completa, sin filtrar — solo para distinguir los estados vacíos. */
  conversations: ConversationListItem[] | null
  /** Lista ya filtrada (por `WhatsappClient`) — lo que se renderiza. */
  visible: ConversationListItem[]
  filtersActive: boolean
  loading: boolean
  error: string | null
  selectedPhone: string | null
  onSelectPhone: (phone: string) => void
  /** Task 4 — true mientras "Ventana por cerrar" u "Orden IA" está activo: muestra el motivo del orden en cada fila. */
  showPriority?: boolean
  /**
   * Vuelve a pedir la lista. Habilita el "tirar para actualizar": sin esto el
   * gesto no se engancha (el hook no registra nada) y la lista se comporta
   * exactamente como antes.
   */
  onRefresh?: () => Promise<unknown> | void
}) {
  // Se desestructura en vez de guardar el objeto entero: el objeto CONTIENE un
  // ref, y las reglas de React dan por hecho que entonces todo lo que salga de
  // él es un ref (leerlo durante el render sería un error de verdad). Sueltas,
  // `distancia` y `estado` son lo que son — dos valores de estado.
  const { contenedorRef, distancia, estado, refrescando } = useTirarParaActualizar(onRefresh)

  return (
    // El envoltorio no scrollea: es el ancla del indicador, que tiene que
    // quedarse quieto mientras el contenido se mueve por detrás.
    <div className="relative flex min-h-0 flex-1 flex-col">
      <IndicadorDeTiron distancia={distancia} estado={estado} />
      {/* `scroll-pane` (globals.css) trae `overscroll-behavior: contain`, que es
          lo que evita que el gesto que llega al tope de la lista se le contagie
          a la página. Sin eso, en Android el mismo tirón dispara ADEMÁS el
          "recargar" del navegador y se pierde todo lo que había en pantalla. */}
      <div
        ref={contenedorRef}
        data-slot="lista-scroller"
        aria-busy={refrescando || undefined}
        className="scroll-pane min-h-0 flex-1"
        style={{
          // Mientras el gesto está en curso, el contenido acompaña al dedo: sin
          // esto el indicador flota solo y el gesto se siente desconectado de la
          // lista. Se acompaña hasta el umbral nada más — pasado ese punto sigue
          // el indicador solo, que es lo que avisa que ya alcanza.
          transform: distancia > 0 ? `translateY(${Math.min(distancia, DISTANCIA_PARA_SOLTAR)}px)` : undefined,
          // Sin transición mientras el dedo manda (si no, va con retraso); con
          // una corta al soltar, para que vuelva en vez de saltar.
          transition: distancia > 0 ? 'none' : 'transform 180ms ease-out',
        }}
      >
      {loading && !conversations ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 p-4 text-sm text-[color:var(--destructive)]">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      ) : !conversations || conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-2 px-4 py-14">
          <MessageCircle className="h-9 w-9 text-muted-foreground" />
          <p className="text-sm font-medium">Todavía no hay conversaciones de WhatsApp</p>
          <p className="text-xs text-muted-foreground max-w-[240px]">
            Acá van a aparecer los WhatsApp que manda el sistema (recordatorios, confirmaciones) y las respuestas de
            los clientes apenas entren.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-2 px-4 py-14">
          <p className="text-sm text-muted-foreground">
            {filtersActive ? 'Ningún resultado con estos filtros.' : 'Ningún resultado.'}
          </p>
        </div>
      ) : (
        visible.map(c => (
          <ConversationRow
            key={c.phone_e164}
            item={c}
            active={selectedPhone === c.phone_e164}
            onSelect={() => onSelectPhone(c.phone_e164)}
            showPriority={showPriority}
          />
        ))
      )}
      </div>
    </div>
  )
}
