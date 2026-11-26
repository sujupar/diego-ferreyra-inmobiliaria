'use client'

import { Clock, Phone, Plus, StickyNote } from 'lucide-react'
import type { ActividadDeFicha } from '@/lib/crm/tipos'
import { cn } from '@/lib/utils'
import { EstadoCarga, EstadoError, EstadoVacio } from '../ui/EstadoBloque'
import { FiltroPastilla } from '../ui/FiltroPastilla'
import { ALTO_CONTROL } from '../ui/medidas'
import { ItemActividad } from './ItemActividad'
import { Tarjeta } from './Tarjeta'
import type { BloqueActividad, FiltroActividad } from './use-ficha'

// La actividad de la persona (maqueta "Línea de tiempo"): filtros, lista, "Ver más" y los
// vacíos de cada filtro con su acción. Los cuatro filtros son los de la maqueta (D5);
// "Actividad" es lo que no es llamada ni nota (en este change, el WhatsApp marcado).

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
      {bloque.estado === 'error' ? (
        <EstadoError onReintentar={onReintentar} />
      ) : bloque.estado === 'cargando' ? (
        <EstadoCarga />
      ) : bloque.items.length === 0 ? (
        vacio
      ) : (
        <>
          <ul className="flex min-w-0 flex-col">
            {bloque.items.map((a) => (
              <ItemActividad
                key={a.id}
                ref={a.id === nuevoId ? refNuevo : undefined}
                actividad={a}
                ahora={ahora}
                nuevo={a.id === nuevoId}
                contactoId={contactoId}
                onEditada={onEditada}
                onAnular={onAnular}
              />
            ))}
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
