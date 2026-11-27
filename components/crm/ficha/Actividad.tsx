'use client'

import { Clock, Phone, Plus, StickyNote, TriangleAlert } from 'lucide-react'
import type { ActividadDeFicha } from '@/lib/crm/tipos'
import { cn } from '@/lib/utils'
import { EstadoCarga, EstadoError, EstadoVacio } from '../ui/EstadoBloque'
import { FiltroPastilla } from '../ui/FiltroPastilla'
import { ALTO_CONTROL } from '../ui/medidas'
import { ItemActividad } from './ItemActividad'
import { ItemEvento } from './ItemEvento'
import { Tarjeta } from './Tarjeta'
import type { BloqueActividad, FiltroActividad } from './use-ficha'

// La actividad de la persona (maqueta "Línea de tiempo"): filtros, lista, "Ver más" y los
// vacíos de cada filtro con su acción. Los cuatro filtros son los de la maqueta (D5);
// "Actividad" es lo que no es llamada ni nota: el WhatsApp marcado y los eventos del
// sistema (crm-linea-de-tiempo).

const FILTROS: { valor: FiltroActividad; etiqueta: string }[] = [
  { valor: 'todo', etiqueta: 'Todo' },
  { valor: 'llamadas', etiqueta: 'Llamadas' },
  { valor: 'notas', etiqueta: 'Notas' },
  { valor: 'actividad', etiqueta: 'Actividad' },
]

const BOTON_SECUNDARIO = cn(
  'inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium shadow-xs hover:bg-accent',
  ALTO_CONTROL,
)

export function Actividad({
  bloque,
  contactoId,
  ahora,
  nuevoId,
  refNuevo,
  onFiltrar,
  onReintentar,
  onVerMas,
  onEditada,
  onAnular,
  onAbrirLlamada,
  onAbrirNota,
}: {
  bloque: BloqueActividad
  contactoId: string
  ahora: Date
  nuevoId: string | null
  refNuevo?: React.Ref<HTMLLIElement>
  onFiltrar: (f: FiltroActividad) => void
  onReintentar: () => void
  onVerMas: () => void
  onEditada: (a: ActividadDeFicha) => void
  onAnular: (a: ActividadDeFicha) => Promise<boolean>
  onAbrirLlamada: () => void
  onAbrirNota: () => void
}) {
  const vacio = (() => {
    switch (bloque.filtro) {
      case 'llamadas':
        return (
          <EstadoVacio
            Icono={Phone}
            titulo="Todavía no hay llamadas"
            texto="Cuando registres una, aparece acá con su resultado."
            accion={
              <button type="button" className={BOTON_SECUNDARIO} onClick={onAbrirLlamada}>
                <Phone aria-hidden className="size-4" />
                Registrar llamada
              </button>
            }
          />
        )
      case 'notas':
        return (
          <EstadoVacio
            Icono={StickyNote}
            titulo="Todavía no hay notas"
            accion={
              <button type="button" className={BOTON_SECUNDARIO} onClick={onAbrirNota}>
                <Plus aria-hidden className="size-4" />
                Escribir una nota
              </button>
            }
          />
        )
      default:
        return <EstadoVacio Icono={Clock} titulo="Sin actividad todavía" />
    }
  })()

  return (
    <Tarjeta titulo="Línea de tiempo" data-bloque="actividad">
      <FiltroPastilla etiqueta="Filtrar la línea de tiempo" opciones={FILTROS} valor={bloque.filtro} onCambiar={onFiltrar} />
      {bloque.estado === 'ok' && bloque.fuentesConError.length > 0 && (
        // Una fuente del sistema rota no tapa a las demás (crm-linea-de-tiempo): se avisa
        // arriba de la lista, nunca se muestra como "no pasó nada".
        <div role="alert" data-aviso="fuentes" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2 text-[13px]">
          <span className="flex items-center gap-2">
            <TriangleAlert aria-hidden className="size-4 shrink-0 text-destructive-texto" />
            Parte de la historia no se pudo cargar
          </span>
          <button type="button" className={BOTON_SECUNDARIO} onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      )}
      {bloque.estado === 'error' ? (
        <EstadoError onReintentar={onReintentar} />
      ) : bloque.estado === 'cargando' ? (
        <EstadoCarga />
      ) : bloque.items.length === 0 ? (
        vacio
      ) : (
        <>
          <ul className="flex min-w-0 flex-col">
            {bloque.items.map((i) =>
              i.tipo === 'evento' ? (
                <ItemEvento key={i.evento.id} evento={i.evento} ahora={ahora} />
              ) : (
                <ItemActividad
                  key={i.actividad.id}
                  ref={i.actividad.id === nuevoId ? refNuevo : undefined}
                  actividad={i.actividad}
                  ahora={ahora}
                  nuevo={i.actividad.id === nuevoId}
                  contactoId={contactoId}
                  onEditada={onEditada}
                  onAnular={onAnular}
                />
              ),
            )}
          </ul>
          {bloque.errorMas && (
            <p role="alert" className="text-center text-xs text-destructive-texto">
              {bloque.errorMas}
            </p>
          )}
          {bloque.hayMas && (
            <button type="button" className={cn(BOTON_SECUNDARIO, 'self-center')} onClick={onVerMas} disabled={bloque.cargandoMas}>
              {bloque.cargandoMas ? 'Cargando…' : 'Ver más'}
            </button>
          )}
        </>
      )}
    </Tarjeta>
  )
}
