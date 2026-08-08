'use client'

import { X } from 'lucide-react'

export interface FilterOption { value: string; label: string }
export interface FilterSelect { key: string; label: string; options: FilterOption[] }

interface Props {
  selects: FilterSelect[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  /**
   * Callback para "Limpiar todo".
   * IMPORTANTE: debe resetear TODOS los filtros de la pantalla, incluidos:
   * - Los que viven en `children` (rango de fechas, "solo míos", etc.)
   * - Los que alimentan `extraActivo`
   * La barra no puede limpiarlos porque no tiene acceso a su estado.
   * Sin esto, el botón "Limpiar todo" queda mintiendo.
   */
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
  // Fichas de valores reconocidos (que existen en las opciones)
  const fichas = selects
    .map(s => ({ s, opcion: s.options.find(o => o.value === values[s.key] && o.value !== '') }))
    .filter((f): f is { s: FilterSelect; opcion: FilterOption } => !!f.opcion)

  // Fichas de valores huérfanos (no en las opciones, pero seteados)
  // Estos ocurren cuando los valores de enum cambian (ej: legacy statuses)
  const huerfa = selects
    .map(s => {
      const valor = values[s.key]
      // Si el valor no está vacío, no coincide con ninguna opción y no ya está en fichas reconocidas
      if (valor && valor !== '' && !s.options.find(o => o.value === valor)) {
        return { s, valor }
      }
      return null
    })
    .filter((f): f is { s: FilterSelect; valor: string } => !!f)

  const hayAlgo = fichas.length > 0 || huerfa.length > 0 || !!extraActivo

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
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
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
          {huerfa.map(({ s, valor }) => (
            <span
              key={`${s.key}-huerfano`}
              className="inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-soft)] px-2.5 py-1 text-xs text-[color:var(--brand)] opacity-60"
            >
              {valor}
              <button
                type="button"
                onClick={() => onChange(s.key, '')}
                aria-label={`Quitar filtro ${s.label} (valor no reconocido)`}
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
