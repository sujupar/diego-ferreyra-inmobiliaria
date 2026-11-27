import Link from 'next/link'
import { CalendarCheck, Check, ChevronRight } from 'lucide-react'
import type { FilaComun } from '@/lib/crm/cartera'
import { datoAsesor, hrefDeFila, lineaTasacion, NOMBRE_ORIGEN, subtituloDeFila } from '@/lib/crm/cartera-pantalla'
import { NOMBRE_ETAPA } from '@/lib/crm/etapas'
import { cn } from '@/lib/utils'
import { ChipEtapa } from '../ui/ChipEtapa'
import { iniciales } from '../ui/iniciales'
import { DatoAsesor, DatoProximoPaso, DatoUltimoContacto } from './DatosFila'

// La fila de un proceso o de una persona (maqueta `fila()`, `.fp`; spec crm-sistema-diseno
// "Fila de proceso"). Toda la fila es UN enlace, sin botones adentro; con "Seleccionar"
// activo pasa a ser UN botón que la marca.
//
// Tabla o tarjeta lo decide el ANCHO DE LA LISTA (container query `@container/lista`, que
// pone quien la contiene), no la ventana ni JavaScript (D10): con el menú abierto a 1024 px
// la lista mide ~736 px y entran las columnas. Debajo de 44rem la fila es tarjeta, con cada
// dato rotulado a la izquierda ("Último contacto", "Próximo paso", "Asesor").
//
// Las clases van ESCRITAS ENTERAS (nunca armadas con plantillas): Tailwind las busca como
// texto en el código, y una clase armada en tiempo de ejecución no existe en la hoja.

export type ModoFila = 'cartera' | 'contactos'

const COLUMNAS = '@min-[44rem]/lista:grid-cols-[2.25rem_minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.7fr)_1rem]'
const COLUMNAS_CON_ASESOR =
  '@min-[44rem]/lista:grid-cols-[2.25rem_minmax(0,2fr)_minmax(0,0.95fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,1.05fr)_1rem]'
// Tarjeta: avatar en la columna 1 a lo alto, los datos apilados en la 2, la flecha en la 3.
// Tabla: todo en la fila 1, cada pieza en su columna.
const GRILLA = 'grid grid-cols-[2.25rem_minmax(0,1fr)_1rem] gap-x-3 @min-[44rem]/lista:items-center'
const CELDA = 'col-start-2 min-w-0 @min-[44rem]/lista:col-start-auto @min-[44rem]/lista:row-start-1'
const ETIQUETA = 'w-[6.25rem] shrink-0 text-xs text-texto-suave @min-[44rem]/lista:hidden'
const DATO = 'flex items-baseline gap-1.5 text-[13px]'

export function CabeceraFilas({ modo, conAsesor, cerrados }: { modo: ModoFila; conAsesor: boolean; cerrados: boolean }) {
  return (
    <div
      aria-hidden
      data-cabecera-filas
      className={cn(
        GRILLA,
        'hidden border-b border-border px-4 py-2 text-xs font-medium text-texto-suave @min-[44rem]/lista:grid',
        conAsesor ? COLUMNAS_CON_ASESOR : COLUMNAS,
      )}
    >
      <span />
      <span>{modo === 'contactos' ? 'Persona' : 'Persona y propiedad'}</span>
      <span>{modo === 'contactos' ? 'Proceso' : 'Etapa'}</span>
      <span>Último contacto</span>
      {/* En Contactos, "Sin proceso abierto" mezcla cerrados (Cierre) y personas sin proceso
          (próximo paso): la cabecera nombra las dos (auditoría B4). La tarjeta rotula por fila. */}
      <span>{cerrados ? (modo === 'contactos' ? 'Cierre / próximo paso' : 'Cierre') : 'Próximo paso'}</span>
      {conAsesor && <span>Asesor</span>}
      <span />
    </div>
  )
}

export interface SeleccionFila {
  marcada: boolean
  alAlternar: () => void
}

export function FilaProceso({
  fila,
  modo,
  conAsesor,
  conTasacion,
  volver,
  ahora,
  seleccion,
  sinProcesoTexto = 'Sin proceso',
}: {
  fila: FilaComun
  modo: ModoFila
  conAsesor: boolean
  /** Muestra el renglón "Tasación mañana 11:00" (grupos de tasaciones, lista del dueño, Contactos). */
  conTasacion: boolean
  /** Camino y búsqueda de la lista, para el "‹ Volver" de la ficha. */
  volver: string
  ahora: Date
  /** Con "Seleccionar" activo: la fila es un botón que la marca. */
  seleccion?: SeleccionFila
  /** Texto de la persona sin proceso (Contactos del asesor: "Sin proceso tuyo", auditoría B3). */
  sinProcesoTexto?: string
}) {
  const tas = conTasacion ? lineaTasacion(fila, { conAsesor }, ahora) : null
  const asesorVacio = datoAsesor(fila).tipo === 'vacio'
  const sub = subtituloDeFila(fila, modo)
  const cerrado = fila.etapa !== null && !fila.abierto

  const contenido = (
    <>
      <span
        aria-hidden
        className={cn(
          // `grid-row` completo (inicio + extensión) en las dos medidas: con `row-span-1` en la
          // tabla, Tailwind v4 escribía `span 1 / span 1` y pisaba el `row-start-1`; el avatar
          // perdía su lugar y las columnas se corrían una (QA 9.3, 2026-11-27).
          'col-start-1 [grid-row:1/span_6] inline-flex size-9 items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand @min-[44rem]/lista:[grid-row:1/2]',
          // Con "Seleccionar" activo, cada fila muestra su casilla (spec "Seleccionar para eliminar").
          seleccion && !seleccion.marcada && 'border-2 border-border bg-card text-transparent',
          seleccion?.marcada && 'bg-brand text-brand-foreground',
        )}
      >
        {seleccion?.marcada ? <Check className="size-4" /> : seleccion ? null : iniciales(fila.nombre)}
      </span>

      <span className={cn(CELDA, 'flex flex-col gap-px')}>
        <span className="text-[15px] font-semibold leading-tight">{fila.nombre}</span>
        {sub && <span className="text-xs leading-snug text-texto-suave">{sub}</span>}
        {/* Video de bienvenida (tasacion-video-bienvenida, D6): gris neutro; el rojo y el ámbar
            quedan para lo vencido y lo de hoy. El detalle (minutos, aperturas) está en la ficha. */}
        {fila.video && (
          <span className="text-xs leading-snug text-texto-suave" data-video-bienvenida={fila.video.estado}>
            {fila.video.texto}
          </span>
        )}
        {tas && (
          <span className="flex items-start gap-1 text-xs font-medium leading-snug text-brand" data-tasacion-cercana>
            <CalendarCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {tas}
          </span>
        )}
      </span>

      <span className={cn(CELDA, 'flex flex-wrap items-center gap-1.5')}>
        {fila.etapa ? (
          <ChipEtapa clave={fila.etapa} etiqueta={NOMBRE_ETAPA[fila.etapa]} neutro />
        ) : (
          <span className="text-[13px] text-texto-suave">{sinProcesoTexto}</span>
        )}
        {modo === 'contactos' && fila.origen && NOMBRE_ORIGEN[fila.origen] && (
          <span className="text-xs text-texto-suave">{NOMBRE_ORIGEN[fila.origen]}</span>
        )}
      </span>

      <span className={cn(CELDA, DATO)}>
        <span className={ETIQUETA}>Último contacto</span>
        <DatoUltimoContacto fila={fila} ahora={ahora} />
      </span>

      <span className={cn(CELDA, DATO)}>
        <span className={ETIQUETA}>{cerrado ? 'Cierre' : 'Próximo paso'}</span>
        <DatoProximoPaso fila={fila} ahora={ahora} />
      </span>

      {conAsesor && (
        // En la tarjeta, el asesor vacío ("—") no ocupa un renglón (spec "Columna Asesor").
        <span
          className={cn(CELDA, DATO, asesorVacio && 'hidden @min-[44rem]/lista:flex')}
          data-asesor-vacio={asesorVacio ? '' : undefined}
        >
          <span className={ETIQUETA}>Asesor</span>
          <DatoAsesor fila={fila} />
        </span>
      )}

      <span aria-hidden className="col-start-3 row-start-1 self-center text-texto-suave @min-[44rem]/lista:col-start-auto">
        <ChevronRight className="size-4" />
      </span>
    </>
  )

  const clases = cn(
    GRILLA,
    conAsesor ? COLUMNAS_CON_ASESOR : COLUMNAS,
    'min-h-11 w-full items-start gap-y-1 px-4 py-3 text-left text-inherit no-underline hover:bg-accent @min-[44rem]/lista:py-2.5',
    'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
  )

  if (seleccion) {
    return (
      <button
        type="button"
        aria-pressed={seleccion.marcada}
        aria-label={`Seleccionar a ${fila.nombre}`}
        onClick={seleccion.alAlternar}
        className={cn(clases, seleccion.marcada && 'bg-brand-soft/50')}
        data-fila={fila.id}
      >
        {contenido}
      </button>
    )
  }
  return (
    <Link href={hrefDeFila(fila, volver)} aria-label={`Abrir la ficha de ${fila.nombre}`} className={clases} data-fila={fila.id}>
      {contenido}
    </Link>
  )
}
