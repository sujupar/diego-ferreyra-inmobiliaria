'use client'

import { X } from 'lucide-react'

export interface FilterOption { value: string; label: string }
export interface FilterSelect { key: string; label: string; options: FilterOption[] }

interface Props {
  selects: FilterSelect[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onClear: () => void
  /**
   * Marca que algún control pasado por `children` está aplicado (rango de fechas,
   * "solo míos"). La barra no puede saberlo sola y sin esto "Limpiar todo" no
   * aparecería con esos filtros puestos.
   */
  extraActivo?: boolean
  /** Controles que ya existen y no son desplegables. No se reescriben. */
  children?: React.ReactNode
}

export function FilterBar({ selects, values, onChange, onClear, extraActivo, children }: Props) {
  const fichas = selects
    .map(s => ({ s, opcion: s.options.find(o => o.value === values[s.key] && o.value !== '') }))
    .filter((f): f is { s: FilterSelect; opcion: FilterOption } => !!f.opcion)

  const hayAlgo = fichas.length > 0 || !!extraActivo

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {selects.map(s => (
          <select
            key={s.key}
            aria-label={s.label}
            value={values[s.key] ?? ''}
            onChange={e => onChange(s.key, e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {s.options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ))}
        {children}
      </div>

      {hayAlgo && (
        <div className="flex flex-wrap items-center gap-2">
          {fichas.map(({ s, opcion }) => (
            <span
              key={s.key}
              className="inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-soft)] px-2.5 py-1 text-xs text-[color:var(--brand)]"
            >
              {opcion.label}
              <button
                type="button"
                onClick={() => onChange(s.key, '')}
                aria-label={`Quitar filtro ${s.label}`}
                className="rounded-full hover:bg-black/10"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClear}
            className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
          >
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  )
}
