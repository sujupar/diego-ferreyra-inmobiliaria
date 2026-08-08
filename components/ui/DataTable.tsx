'use client'

import { useRef, useEffect, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

export interface Column<T> {
  key: string
  label: string
  render: (row: T) => React.ReactNode
  sortable?: boolean
  className?: string
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
      className="h-4 w-4 rounded border-input cursor-pointer"
      aria-label="Seleccionar todo"
    />
  )
}

export function DataTable<T>({ data, columns, onRowClick, getRowKey, emptyMessage, selectable, selectedIds, onSelectionChange, sort, onSortChange }: DataTableProps<T>) {
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

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead>
          {/* Ronda de arreglos 1 — I4: la Tarea 9 había sumado `sticky top-0
              z-10` acá, pero no pega nada — el contenedor de este wrapper
              tiene `overflow-x-auto`, y por spec CSS eso lo convierte en el
              contenedor de scroll de referencia para `sticky`; como ese div
              nunca tiene una altura acotada en ninguno de los 5 consumidores,
              nunca scrollea y el sticky nunca se activa. No es una regresión
              (antes tampoco pegaba), pero era una promesa que el código no
              cumplía. Para que pegue de verdad hace falta un ancestro con
              altura acotada + su propio overflow-y — no es parte de esta tarea. */}
          <tr className="bg-card border-b">
            {selectable && (
              <th className="w-10 px-3 py-3">
                <HeaderCheckbox
                  checked={!!allSelected}
                  indeterminate={!!someSelected}
                  onChange={toggleAll}
                />
              </th>
            )}
            {columns.map(col => (
              <th
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
        <tbody>
          {sorted.map(row => {
            const key = getRowKey(row)
            const isSelected = selectable && selSet.has(key)
            return (
              <tr
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
                  <td className="w-10 px-3 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!isSelected}
                      onChange={() => toggleRow(key)}
                      className="h-4 w-4 rounded border-input cursor-pointer"
                      aria-label="Seleccionar fila"
                    />
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 whitespace-nowrap ${col.className || ''} ${col.className?.includes('text-right') ? 'tabular-n' : ''}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
