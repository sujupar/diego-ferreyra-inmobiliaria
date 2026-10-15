'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilterBar, type FilterOption } from '@/components/filters/FilterBar'
import { BotonAgendarVisita } from '@/components/visitas/BotonAgendarVisita'
import { PERIODO_ETIQUETA, PERIODO_POR_DEFECTO, type ClavePeriodo } from '@/lib/visitas/periodo'

export interface ValoresFiltro { asesor: string; propiedad: string; origen: string }

const CHIPS: ReadonlyArray<Exclude<ClavePeriodo, 'personalizado'>> = ['7d', '30d', 'mes']

/**
 * Período (7 días / 30 días / Este mes / Personalizado), filtros y "Agendar visita"
 * (spec §3.4). Solo muestra y avisa: la pantalla decide qué se escribe en la URL.
 */
export function EncabezadoVisitas({
  clave, desde, hasta, valores, opcionesAsesor, opcionesPropiedad, opcionesOrigen,
  onPeriodo, onRango, onFiltro, onLimpiar, onAgendada,
}: {
  clave: ClavePeriodo
  desde: string
  hasta: string
  valores: ValoresFiltro
  /** `null` = quien mira no elige asesor (asesor: ve lo suyo). */
  opcionesAsesor: FilterOption[] | null
  opcionesPropiedad: FilterOption[]
  opcionesOrigen: FilterOption[]
  onPeriodo: (clave: Exclude<ClavePeriodo, 'personalizado'>) => void
  onRango: (desde: string, hasta: string) => void
  onFiltro: (clave: keyof ValoresFiltro, valor: string) => void
  onLimpiar: () => void
  onAgendada: () => void
}) {
  const [personalizadoAbierto, setPersonalizadoAbierto] = useState(clave === 'personalizado')
  const [borradorDesde, setBorradorDesde] = useState(desde)
  const [borradorHasta, setBorradorHasta] = useState(hasta)
  const chip = (activo: boolean) =>
    `min-h-11 rounded-full px-4 ${activo ? 'bg-brand text-brand-foreground hover:bg-brand/90' : ''}`

  const selects = [
    { key: 'origen', label: 'Origen', options: opcionesOrigen },
    { key: 'propiedad', label: 'Propiedad', options: opcionesPropiedad },
    ...(opcionesAsesor ? [{ key: 'asesor', label: 'Asesor', options: opcionesAsesor }] : []),
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
          {CHIPS.map(c => (
            <Button key={c} type="button" variant={clave === c ? 'default' : 'outline'} aria-pressed={clave === c}
              className={chip(clave === c)} onClick={() => { setPersonalizadoAbierto(false); onPeriodo(c) }}>
              {PERIODO_ETIQUETA[c]}
            </Button>
          ))}
          <Button type="button" variant={clave === 'personalizado' ? 'default' : 'outline'} aria-pressed={clave === 'personalizado'}
            className={chip(clave === 'personalizado')}
            onClick={() => { setBorradorDesde(desde); setBorradorHasta(hasta); setPersonalizadoAbierto(a => !a) }}>
            {PERIODO_ETIQUETA.personalizado}
          </Button>
        </div>
        <BotonAgendarVisita onAgendada={onAgendada} />
      </div>

      {personalizadoAbierto && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={e => { e.preventDefault(); onRango(borradorDesde, borradorHasta) }}
        >
          <label className="space-y-1 text-sm"><span className="block">Desde</span>
            <input type="date" value={borradorDesde} onChange={e => setBorradorDesde(e.target.value)}
              className="h-11 rounded-md border bg-background px-3 text-base" />
          </label>
          <label className="space-y-1 text-sm"><span className="block">Hasta</span>
            <input type="date" value={borradorHasta} onChange={e => setBorradorHasta(e.target.value)}
              className="h-11 rounded-md border bg-background px-3 text-base" />
          </label>
          <Button type="submit" className="min-h-11">Aplicar</Button>
        </form>
      )}

      <FilterBar
        selects={selects}
        values={{ ...valores }}
        onChange={(k, valor) => { if (k === 'asesor' || k === 'propiedad' || k === 'origen') onFiltro(k, valor) }}
        onClear={onLimpiar}
        extraActivo={clave !== PERIODO_POR_DEFECTO}
      />
    </div>
  )
}
