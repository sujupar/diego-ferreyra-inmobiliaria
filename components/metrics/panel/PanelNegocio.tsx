'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Panel } from '@/lib/metrics/panel/servidor'
import { hoyArgentina, rangoDeAtajo, type Agrupar, type Atajo, type Comparar, type Rango } from '@/lib/metrics/panel/rango'
import { BarraFiltros } from './BarraFiltros'
import { NumerosPlata } from './NumerosPlata'
import { EmbudoCanal } from './EmbudoCanal'
import { SerieConversion } from './SerieConversion'
import { LandingsVideo } from './LandingsVideo'
import { PlataNegocio } from './PlataNegocio'
import { Planificador } from './Planificador'
import { CargaDatos } from './CargaDatos'

export interface Filtros {
  atajo: Atajo | 'personalizado'
  rango: Rango
  comparar: Comparar
  agrupar: Agrupar
  vista: 'eventos' | 'cohorte'
  embudo: 'todos' | 'tasacion' | 'clase'
}

const CLAVE = 'panel-negocio-filtros'

function filtrosIniciales(): Filtros {
  const hoy = hoyArgentina()
  const base: Filtros = { atajo: 'anio', rango: rangoDeAtajo('anio', hoy), comparar: 'anterior', agrupar: 'mes', vista: 'eventos', embudo: 'todos' }
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Partial<Filtros> | null
    if (!g) return base
    const f = { ...base, ...g }
    // Un atajo guardado se recalcula con la fecha de hoy ("este mes" de la semana pasada no sirve).
    if (f.atajo !== 'personalizado') f.rango = rangoDeAtajo(f.atajo, hoy)
    return f
  } catch { return base }
}

export function PanelNegocio() {
  const [filtros, setFiltros] = useState<Filtros | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [alcance, setAlcance] = useState<Record<string, number | null> | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  /** Número de la última carga: una respuesta de una carga anterior (más lenta) se descarta. */
  const pedido = useRef(0)

  useEffect(() => { setFiltros(filtrosIniciales()) }, [])
  useEffect(() => {
    if (!filtros) return
    try { localStorage.setItem(CLAVE, JSON.stringify(filtros)) } catch { /* sin almacenamiento: no pasa nada */ }
  }, [filtros])

  const cargar = useCallback(async (f: Filtros) => {
    const n = ++pedido.current
    setCargando(true); setError(null)
    const q = new URLSearchParams({ desde: f.rango.desde, hasta: f.rango.hasta, comparar: f.comparar, agrupar: f.agrupar, vista: f.vista })
    try {
      const r = await fetch(`/api/metrics/panel?${q}`)
      const data = await r.json().catch(() => null)
      if (n !== pedido.current) return
      if (!r.ok || !data) throw new Error(data?.error ?? `No se pudo armar el panel (error ${r.status}).`)
      setPanel(data)
    } catch (e) {
      if (n === pedido.current) setError(e instanceof Error ? e.message : 'No se pudo armar el panel.')
    } finally { if (n === pedido.current) setCargando(false) }
    if (n !== pedido.current) return
    // El alcance lo trae Meta y puede tardar: va aparte para no frenar el resto.
    setAlcance(null)
    fetch(`/api/metrics/panel/alcance?desde=${f.rango.desde}&hasta=${f.rango.hasta}`)
      .then(r => (r.ok ? r.json() : null)).then(a => { if (n === pedido.current) setAlcance(a) }).catch(() => { if (n === pedido.current) setAlcance(null) })
  }, [])

  useEffect(() => { if (filtros) cargar(filtros) }, [filtros?.rango.desde, filtros?.rango.hasta, filtros?.comparar, filtros?.agrupar, filtros?.vista, version]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!filtros) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />

  const embudos = filtros.embudo === 'todos' ? (['tasacion', 'clase'] as const) : [filtros.embudo]
  const recargar = () => setVersion(v => v + 1)

  return (
    <div className="space-y-6">
      <BarraFiltros filtros={filtros} onChange={setFiltros} cargando={cargando} onRefrescar={recargar} />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-4 flex flex-wrap items-center gap-3 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4" /> {error}
          <Button size="sm" variant="outline" onClick={recargar}><RefreshCw className="h-4 w-4 mr-1" />Reintentar</Button>
        </div>
      )}

      {!panel && cargando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Armando el panel…</div>}

      {panel && (
        <div className={cargando ? 'opacity-60 transition-opacity' : ''}>
          <div className="space-y-6">
            <NumerosPlata panel={panel} />
            <section className="space-y-4">
              {embudos.map(e => <EmbudoCanal key={e} embudo={e} panel={panel} alcance={alcance?.[e]} vista={filtros.vista} onVista={vista => setFiltros({ ...filtros, vista })} />)}
            </section>
            {embudos.map(e => <SerieConversion key={e} embudo={e} panel={panel} agrupar={filtros.agrupar} />)}
            <LandingsVideo panel={panel} embudos={[...embudos]} />
            <PlataNegocio panel={panel} />
            <Planificador panel={panel} />
            <CargaDatos onCambio={recargar} />
            <p className="text-xs text-muted-foreground">
              Fuera de todos los números: {panel.excluidas.pruebas} registros de prueba, {panel.excluidas.colegas} colegas y {panel.excluidas.repetidas} pedidos repetidos de la misma persona.
              Inversión en USD al dólar blue de cada día.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
