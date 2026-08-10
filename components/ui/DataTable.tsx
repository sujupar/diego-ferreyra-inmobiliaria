'use client'

import { useRef, useEffect, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Rol de una columna cuando la tabla se dibuja como FICHA (pantalla angosta).
 *
 *  'title'  → renglón 1, a la izquierda: la IDENTIDAD de la fila. Se come el
 *             ancho sobrante y corta con puntos suspensivos.
 *  'badge'  → renglón 1, a la derecha: el ESTADO. No se encoge.
 *  'meta'   → renglón 2: los metadatos, uno al lado del otro, separados por aire.
 *  'none'   → no se dibuja en la ficha (lo que solo sirve con un mouse).
 */
export type RolFicha = 'title' | 'badge' | 'meta' | 'none'

export interface Column<T> {
  key: string
  label: string
  render: (row: T) => React.ReactNode
  sortable?: boolean
  className?: string
  /**
   * Deja que la celda ENVUELVA en vez de estirar la tabla. Por default toda
   * celda es `whitespace-nowrap`, que es lo correcto para fechas y precios y
   * lo peor posible para Dirección, Email o Propiedad: son justo las columnas
   * que podrían ceder ancho y en cambio empujan la tabla a 900px.
   */
  wrap?: boolean
  /**
   * Rol en la FICHA. Si NINGUNA columna declara `'title'`, la primera pasa a
   * serlo automáticamente: una ficha sin título es una lista de metadatos sin
   * sujeto, y ese es el peor default posible para una pantalla que todavía no
   * se migró. El resto, sin declarar, cae en `'meta'`.
   */
  card?: RolFicha
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  onRowClick?: (row: T) => void
  getRowKey: (row: T) => string
  emptyMessage?: string
  /** Si true, muestra una columna de checkboxes por fila + checkbox master en el header. */
  selectable?: boolean
  /** IDs seleccionados (solo si selectable). */
  selectedIds?: Set<string>
  /** Callback con el nuevo set. */
  onSelectionChange?: (selected: Set<string>) => void
  /**
   * Orden CONTROLADO por el padre. Pasar `onSortChange` activa este modo: el
   * componente deja de ordenar `data` en memoria (asume que el padre ya la
   * pidió ordenada — típicamente al servidor) y solo reporta clicks de header.
   * Sin `onSortChange`, el comportamiento es el de siempre: ordena `data`
   * localmente (correcto solo si `data` son TODAS las filas, no una página).
   *
   * Por qué existe (hallazgo #7, revisión adversarial 2026-07-31): con datos
   * paginados, ordenar en memoria solo reordena la página cargada — "Precio"
   * mostraba la más cara de los primeros 24 resultados, no de todo el
   * sistema, sin ninguna señal en pantalla. `app/(dashboard)/properties/page.tsx`
   * es el único caller paginado hoy y usa este modo.
   */
  sort?: { key: string; dir: 'asc' | 'desc' } | null
  onSortChange?: (key: string, dir: 'asc' | 'desc') => void
  /**
   * En una caja angosta, ¿la tabla se convierte en fichas apiladas? Por
   * default SÍ — es lo que hace usable la pantalla en un teléfono.
   *
   * Se apaga (`false`) en las tablas de NÚMEROS del tablero de métricas, que
   * además viven adentro de tarjetas angostas: ahí comparar una columna
   * contra la de al lado ES la función de la tabla, y apilar cada fila la
   * destruye. Esas se quedan como tabla y se deslizan de costado, con el
   * degradado de `.tabla-desliza` avisando que hay más a la derecha.
   *
   * El apagado no es un `if`: sin `cardMode` no se pone la clase
   * `.tabla-ficha`, que es lo único que declara el contenedor CSS del que
   * cuelgan TODAS las reglas de la ficha (ver `app/globals.css`).
   */
  cardMode?: boolean
}

/** Nombre del rol en el atributo que lee el CSS (prosa del proyecto en español). */
const CELDA_POR_ROL: Record<RolFicha, string> = {
  title: 'titulo',
  badge: 'insignia',
  meta: 'dato',
  none: 'oculto',
}

/**
 * Qué rol tiene cada columna en la ficha, en el mismo orden que `columns`.
 *
 * Exportada porque es la única regla de negocio del patrón y se puede probar
 * sin renderizar nada: si esto se equivoca, la ficha queda sin título (o con
 * dos) y ningún test de layout lo notaría.
 */
export function rolesDeFicha<T>(columns: Column<T>[]): RolFicha[] {
  const hayTituloDeclarado = columns.some(c => c.card === 'title')
  return columns.map((col, i) =>
    col.card ?? (!hayTituloDeclarado && i === 0 ? 'title' : 'meta'),
  )
}

function HeaderCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: (v: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      onClick={e => e.stopPropagation()}
      className="h-4 w-4 max-md:h-5 max-md:w-5 rounded border-input cursor-pointer"
      aria-label="Seleccionar todo"
    />
  )
}

export function DataTable<T>({ data, columns, onRowClick, getRowKey, emptyMessage, selectable, selectedIds, onSelectionChange, sort, onSortChange, cardMode = true }: DataTableProps<T>) {
  const controlled = !!onSortChange
  const [localSortKey, setLocalSortKey] = useState<string | null>(null)
  const [localSortDir, setLocalSortDir] = useState<'asc' | 'desc'>('desc')

  const sortKey = controlled ? (sort?.key ?? null) : localSortKey
  const sortDir = controlled ? (sort?.dir ?? 'desc') : localSortDir

  function handleSort(key: string) {
    const nextDir: 'asc' | 'desc' = sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc'
    if (controlled) {
      onSortChange!(key, nextDir)
      return
    }
    setLocalSortKey(key)
    setLocalSortDir(nextDir)
  }

  // Modo controlado: `data` ya viene ordenada por el padre (server-side) —
  // ordenarla de nuevo acá reintroduciría el bug de "solo ordena la página
  // cargada" para el caso que motivó este modo.
  const sorted = controlled
    ? data
    : sortKey
    ? [...data].sort((a, b) => {
        const col = columns.find(c => c.key === sortKey)
        if (!col) return 0
        const aVal = (a as any)[sortKey]
        const bVal = (b as any)[sortKey]
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal
        return sortDir === 'asc' ? cmp : -cmp
      })
    : data

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        {emptyMessage || 'Sin datos'}
      </div>
    )
  }

  const selSet = selectedIds || new Set<string>()
  const allKeys = data.map(getRowKey)
  const allSelected = selectable && allKeys.length > 0 && allKeys.every(k => selSet.has(k))
  const someSelected = selectable && !allSelected && allKeys.some(k => selSet.has(k))

  function toggleAll(checked: boolean) {
    if (!onSelectionChange) return
    const next = new Set(selSet)
    if (checked) allKeys.forEach(k => next.add(k))
    else allKeys.forEach(k => next.delete(k))
    onSelectionChange(next)
  }

  function toggleRow(key: string) {
    if (!onSelectionChange) return
    const next = new Set(selSet)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectionChange(next)
  }

  const roles = rolesDeFicha(columns)
  const indicePrimerDato = roles.indexOf('meta')
  // Ordenar por una columna que la ficha no muestra no le dice nada a nadie —
  // salvo que el orden YA sea ese (se eligió en la cabecera, en una pantalla
  // ancha): sacarla de la lista dejaría el desplegable en blanco mintiendo
  // sobre por dónde está ordenada la lista.
  const ordenables = columns.filter((c, i) => c.sortable && (roles[i] !== 'none' || c.key === sortKey))

  return (
    <div className={`${cardMode ? 'tabla-ficha ' : ''}tabla-desliza rounded-xl border bg-card shadow-sm`}>
      {/* Barra de la FICHA. Solo se ve en la caja angosta (`.tabla-barra` es
          `display:none` salvo dentro de la consulta de contenedor): ordenar y
          seleccionar todo viven en la cabecera de la tabla, y la cabecera es
          justo lo que la ficha no dibuja. Sin esto, las dos funciones quedan
          inalcanzables desde un teléfono. */}
      {cardMode && (selectable || ordenables.length > 0) && (
        <div className="tabla-barra items-center gap-2 border-b p-2">
          {selectable && (
            <button
              type="button"
              onClick={() => toggleAll(!allSelected)}
              className="tap shrink-0 rounded-md border px-3 text-sm font-medium"
            >
              {allSelected ? 'Ninguna' : 'Todas'}
            </button>
          )}
          {ordenables.length > 0 && (
            <>
              {/* `<select>` NATIVO a propósito: abre la rueda de iOS, que es
                  mejor que cualquier desplegable propio en una pantalla táctil
                  (y la regla de los 16px de `globals.css` ya lo salva del zoom
                  automático de Safari). */}
              <select
                aria-label="Ordenar la lista"
                value={sortKey ?? ''}
                onChange={e => handleSort(e.target.value)}
                className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3"
              >
                <option value="" disabled>Ordenar por…</option>
                {ordenables.map(c => (
                  <option key={c.key} value={c.key}>Ordenar por {c.label}</option>
                ))}
              </select>
              {sortKey && (
                // Elegir otra columna en el desplegable arranca en descendente;
                // este botón es la ÚNICA forma de invertir sin la cabecera.
                <button
                  type="button"
                  onClick={() => handleSort(sortKey)}
                  aria-label={sortDir === 'asc' ? 'Orden ascendente. Tocar para invertirlo.' : 'Orden descendente. Tocar para invertirlo.'}
                  className="tap flex shrink-0 items-center justify-center rounded-md border"
                >
                  {sortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Los `role` van escritos aunque sean los implícitos de `<table>`: en la
          ficha estos elementos pasan a `display: block/flex` y los navegadores
          le sacan la semántica de tabla al perder el `display` tabular. Con el
          rol explícito, el lector de pantalla sigue leyendo filas y celdas. */}
      <table role="table" className="w-full text-sm">
        <thead role="rowgroup">
          {/* Ronda de arreglos 1 — I4: la Tarea 9 había sumado `sticky top-0
              z-10` acá, pero no pega nada — el contenedor de este wrapper
              tiene `overflow-x-auto`, y por spec CSS eso lo convierte en el
              contenedor de scroll de referencia para `sticky`; como ese div
              nunca tiene una altura acotada en ninguno de los 5 consumidores,
              nunca scrollea y el sticky nunca se activa. No es una regresión
              (antes tampoco pegaba), pero era una promesa que el código no
              cumplía. Para que pegue de verdad hace falta un ancestro con
              altura acotada + su propio overflow-y — no es parte de esta tarea. */}
          <tr role="row" className="bg-card border-b">
            {selectable && (
              <th role="columnheader" className="w-10 px-3 py-3">
                <HeaderCheckbox
                  checked={!!allSelected}
                  indeterminate={!!someSelected}
                  onChange={toggleAll}
                />
              </th>
            )}
            {columns.map(col => (
              <th
                role="columnheader"
                key={col.key}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                className={`px-4 py-3 text-left eyebrow whitespace-nowrap ${col.sortable ? 'cursor-pointer hover:text-foreground select-none' : ''} ${col.className || ''}`}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {sorted.map(row => {
            const key = getRowKey(row)
            const isSelected = selectable && selSet.has(key)
            return (
              <tr
                role="row"
                key={key}
                data-selected={isSelected}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                // Ronda de arreglos 1 — I1: un `bg-[...]` suelto y un
                // `hover:bg-secondary/60` empatan en especificidad solo en
                // apariencia — Tailwind decide el orden de generación, no el
                // string de className, así que el hover le ganaba SIEMPRE al
                // fondo de selección (igual que el bug ya resuelto en
                // sidebar.tsx). Fix: mismo patrón, `data-[selected=true]:hover:*`
                // (0,3,0) le gana a `hover:*` (0,2,0) sin importar el orden.
                className={`border-t data-[selected=true]:bg-[color:var(--brand-soft)] ${onRowClick ? 'cursor-pointer transition-colors hover:bg-secondary/60 data-[selected=true]:hover:bg-[color:var(--brand-soft)]' : ''}`}
              >
                {selectable && (
                  <td role="cell" data-celda="seleccion" className="w-10 px-3 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!isSelected}
                      onChange={() => toggleRow(key)}
                      className="h-4 w-4 max-md:h-5 max-md:w-5 rounded border-input cursor-pointer"
                      aria-label="Seleccionar fila"
                    />
                  </td>
                )}
                {columns.map((col, i) => (
                  <td
                    role="cell"
                    key={col.key}
                    data-celda={CELDA_POR_ROL[roles[i]]}
                    // El primer metadato no lleva la separación que los demás
                    // tienen a su izquierda (no hay nada antes que separar). Se
                    // marca acá y no con un `+` de CSS porque el orden VISUAL de
                    // la ficha lo pone `order`, y el selector de hermanos
                    // contiguos solo ve el orden del DOM.
                    data-primero={cardMode && i === indicePrimerDato ? '' : undefined}
                    className={`px-4 py-3 ${col.wrap ? '' : 'whitespace-nowrap'} ${col.className || ''} ${col.className?.includes('text-right') ? 'tabular-n' : ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
                {cardMode && (
                  <>
                    {/* Estas dos celdas SOLO existen en la ficha (en la tabla
                        son `display:none`) y van con `aria-hidden` porque no
                        aportan ningún dato: una es el salto de renglón, la
                        otra el signo de "esto se toca". */}
                    {onRowClick && (
                      <td aria-hidden="true" data-celda="chevron">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    )}
                    <td aria-hidden="true" data-celda="salto" />
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
