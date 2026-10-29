'use client'

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { BusquedaTexto } from '@/components/filters/BusquedaTexto'
import { cn } from '@/lib/utils'
import type { FILTROS_DEFECTO_CONSULTAS, PeriodoConsultas } from '@/lib/consultas/filtros'
import type { ConteoOpcion } from '@/lib/consultas/tipos'

export type ValoresFiltrosConsultas = typeof FILTROS_DEFECTO_CONSULTAS

const PERIODOS: ReadonlyArray<{ clave: Exclude<PeriodoConsultas, 'personalizado'>; etiqueta: string }> = [
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: '7d', etiqueta: '7 días' },
  { clave: '30d', etiqueta: '30 días' },
  { clave: 'mes', etiqueta: 'Este mes' },
]

const ESTADOS = [
  { value: '', label: 'Todas' },
  { value: 'sin_visita', label: 'Sin visita' },
  { value: 'con_visita', label: 'Con visita agendada' },
  { value: 'visito', label: 'Visitó' },
]

interface Opcion { value: string; label: string }

function Selector({ etiqueta, valor, opciones, onCambio }: {
  etiqueta: string; valor: string; opciones: Opcion[]; onCambio: (v: string) => void
}) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">{etiqueta}</label>
      <select
        id={id}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        // Un <select> toma el ancho de su opción más larga (direcciones): con
        // `w-full min-w-0` no empuja la página de costado en un teléfono.
        className="h-11 w-full min-w-0 max-w-full truncate rounded-md border border-input bg-background px-3 text-sm md:h-10"
      >
        {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

/**
 * Período, portal, propiedad, estado, asesor y búsqueda (spec §3.2). Solo muestra
 * y avisa: la pantalla decide qué se escribe en la dirección. Se usa igual en la
 * compu (en línea) y en el celular (dentro de la hoja "Filtros").
 */
export function FiltrosConsultas({
  valores, porPortal, porPropiedad, asesores, hayFiltros, onCambio, onLimpiar,
}: {
  valores: ValoresFiltrosConsultas
  porPortal: ConteoOpcion[]
  porPropiedad: ConteoOpcion[]
  /** `null` = quien mira no elige asesor (el asesor ve lo suyo). */
  asesores: Array<{ id: string; full_name: string }> | null
  hayFiltros: boolean
  onCambio: (cambio: Partial<ValoresFiltrosConsultas>) => void
  onLimpiar: () => void
}) {
  const personalizado = valores.periodo === 'personalizado' || valores.from !== '' || valores.to !== ''
  const [rangoAbierto, setRangoAbierto] = useState(personalizado)
  const [desde, setDesde] = useState(valores.from)
  const [hasta, setHasta] = useState(valores.to)

  const chip = (activo: boolean) => cn('min-h-11 rounded-full px-4 md:min-h-9', activo && 'bg-brand text-brand-foreground hover:bg-brand/90')

  const opcionesPortal: Opcion[] = [
    { value: '', label: 'Todos' },
    ...porPortal.map((p) => ({ value: p.valor, label: `${p.etiqueta} (${p.n})` })),
  ]
  // "Sin propiedad identificada" llega PRIMERO desde el servidor (bandeja.ts):
  // es lo que el equipo tiene que resolver, no una propiedad más.
  const opcionesPropiedad: Opcion[] = [
    { value: '', label: 'Todas' },
    ...porPropiedad.map((p) => ({ value: p.valor, label: p.valor === 'sin' ? `⚠ ${p.etiqueta} (${p.n})` : `${p.etiqueta} (${p.n})` })),
  ]

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Período" className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => {
          const activo = !personalizado && valores.periodo === p.clave
          return (
            <Button key={p.clave} type="button" variant={activo ? 'default' : 'outline'} aria-pressed={activo}
              className={chip(activo)}
              onClick={() => { setRangoAbierto(false); onCambio({ periodo: p.clave, from: '', to: '' }) }}>
              {p.etiqueta}
            </Button>
          )
        })}
        <Button type="button" variant={personalizado ? 'default' : 'outline'} aria-pressed={personalizado}
          className={chip(personalizado)}
          onClick={() => { setDesde(valores.from); setHasta(valores.to); setRangoAbierto((a) => !a) }}>
          Personalizado
        </Button>
      </div>

      {rangoAbierto && (
        <form className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); onCambio({ periodo: 'personalizado', from: desde, to: hasta }) }}>
          <label className="space-y-1 text-sm"><span className="block">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="h-11 rounded-md border bg-background px-3 text-base" />
          </label>
          <label className="space-y-1 text-sm"><span className="block">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="h-11 rounded-md border bg-background px-3 text-base" />
          </label>
          <Button type="submit" className="min-h-11">Aplicar</Button>
        </form>
      )}

      <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', asesores ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        <Selector etiqueta="Portal" valor={valores.portal} opciones={opcionesPortal} onCambio={(v) => onCambio({ portal: v })} />
        <Selector etiqueta="Propiedad" valor={valores.propiedad} opciones={opcionesPropiedad} onCambio={(v) => onCambio({ propiedad: v })} />
        <Selector etiqueta="Estado" valor={valores.estado} opciones={ESTADOS} onCambio={(v) => onCambio({ estado: v })} />
        {asesores && (
          <Selector etiqueta="Asesor" valor={valores.asesor}
            opciones={[{ value: '', label: 'Todos' }, { value: 'sin', label: 'Sin asesor' }, ...asesores.map((a) => ({ value: a.id, label: a.full_name }))]}
            onCambio={(v) => onCambio({ asesor: v })} />
        )}
        {/* BusquedaTexto trae un ancho fijo de listado (`sm:w-72`) que acá
            desbordaría la columna: se lo estira a la celda, alto táctil incluido. */}
        <div className="flex min-w-0 flex-col gap-1 [&_input]:h-11 [&_input]:w-full md:[&_input]:h-10 [&>div]:w-full">
          <span className="text-xs text-muted-foreground" aria-hidden="true">Buscar</span>
          <BusquedaTexto value={valores.q} onChange={(q) => onCambio({ q })}
            etiqueta="Buscar consultas" placeholder="Nombre, teléfono, email o dirección" />
        </div>
      </div>

      {hayFiltros && (
        <div>
          <Button type="button" variant="ghost" className="min-h-11 px-2 text-muted-foreground" onClick={onLimpiar}>
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  )
}
