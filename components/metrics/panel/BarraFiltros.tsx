'use client'

import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { hoyArgentina, rangoDeAtajo, type Atajo } from '@/lib/metrics/panel/rango'
import type { Filtros } from './PanelNegocio'

const ATAJOS: { key: Atajo; label: string }[] = [
  { key: 'esta_semana', label: 'Esta semana' },
  { key: 'semana_pasada', label: 'Semana pasada' },
  { key: 'este_mes', label: 'Este mes' },
  { key: 'mes_pasado', label: 'Mes pasado' },
  { key: 'ultimos_30', label: 'Últimos 30 días' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'anio', label: 'Año' },
]

const sel = 'rounded-md border px-2 py-1.5 text-sm bg-background'

function Grupo<T extends string>({ valor, opciones, onChange, etiqueta }: { valor: T; opciones: { key: T; label: string }[]; onChange: (v: T) => void; etiqueta: string }) {
  return (
    <label className="text-sm flex items-center gap-1.5">
      <span className="text-muted-foreground">{etiqueta}</span>
      <select className={sel} value={valor} onChange={e => onChange(e.target.value as T)}>
        {opciones.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function BarraFiltros({ filtros, onChange, cargando, onRefrescar }: { filtros: Filtros; onChange: (f: Filtros) => void; cargando: boolean; onRefrescar: () => void }) {
  const f = filtros
  return (
    <div className="sticky top-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-4 py-3 bg-background/95 backdrop-blur border-b sm:border sm:rounded-xl space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {ATAJOS.map(a => (
          <Button key={a.key} size="sm" variant={f.atajo === a.key ? 'default' : 'outline'}
            onClick={() => onChange({ ...f, atajo: a.key, rango: rangoDeAtajo(a.key, hoyArgentina()) })}>
            {a.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="text-sm flex items-center gap-1.5">
          <span className="text-muted-foreground">Desde</span>
          <input type="date" className={sel} value={f.rango.desde} max={f.rango.hasta}
            onChange={e => e.target.value && onChange({ ...f, atajo: 'personalizado', rango: { ...f.rango, desde: e.target.value } })} />
        </label>
        <label className="text-sm flex items-center gap-1.5">
          <span className="text-muted-foreground">Hasta</span>
          <input type="date" className={sel} value={f.rango.hasta} min={f.rango.desde}
            onChange={e => e.target.value && onChange({ ...f, atajo: 'personalizado', rango: { ...f.rango, hasta: e.target.value } })} />
        </label>
        <Grupo etiqueta="Comparar con" valor={f.comparar} onChange={comparar => onChange({ ...f, comparar })}
          opciones={[{ key: 'anterior', label: 'Período anterior' }, { key: 'anio_pasado', label: 'Mismo período del año pasado' }, { key: 'ninguno', label: 'Nada' }]} />
        <Grupo etiqueta="Embudo" valor={f.embudo} onChange={embudo => onChange({ ...f, embudo })}
          opciones={[{ key: 'todos', label: 'Los dos' }, { key: 'tasacion', label: 'Tasación' }, { key: 'clase', label: 'Clase gratuita' }]} />
        <Grupo etiqueta="Agrupar por" valor={f.agrupar} onChange={agrupar => onChange({ ...f, agrupar })}
          opciones={[{ key: 'dia', label: 'Día' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }]} />
        <Button size="icon" variant="ghost" onClick={onRefrescar} disabled={cargando} aria-label="Actualizar">
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
