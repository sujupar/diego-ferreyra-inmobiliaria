'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Tablero as DatosTablero } from '@/lib/metrics/tablero/servidor'
import { hoyArgentina, rangoDeAtajo, type Atajo, type Comparar, type Rango } from '@/lib/metrics/panel/rango'
import { DeDondeSale } from '@/components/metrics/panel/DeDondeSale'
import { fechaCorta, pct, usd } from '@/components/metrics/panel/formato'
import { FranjaAnuncios } from './FranjaAnuncios'
import { FranjaComercial } from './FranjaComercial'
import { FranjaPagina } from './FranjaPagina'
import { FranjaPropiedades } from './FranjaPropiedades'
import { FranjaPlata } from './FranjaPlata'

interface Filtros { atajo: Atajo | 'personalizado'; rango: Rango; comparar: Comparar }

const ATAJOS: { key: Atajo | 'personalizado'; label: string }[] = [
  { key: 'este_mes', label: 'Este mes' },
  { key: 'mes_pasado', label: 'Mes pasado' },
  { key: 'esta_semana', label: 'Esta semana' },
  { key: 'semana_pasada', label: 'Semana pasada' },
  { key: 'ultimos_30', label: 'Últimos 30 días' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'anio', label: 'Año' },
  { key: 'personalizado', label: 'Fechas…' },
]
const COMPARAR: { key: Comparar; label: string }[] = [
  { key: 'mes_anterior', label: 'Mismo tramo del mes anterior' },
  { key: 'anterior', label: 'Período anterior' },
  { key: 'anio_pasado', label: 'Mismo período del año pasado' },
  { key: 'ninguno', label: 'Nada' },
]
const sel = 'rounded-md border px-2 py-1.5 text-sm bg-background'

export function Tablero() {
  const [f, setF] = useState<Filtros>(() => ({ atajo: 'este_mes', rango: rangoDeAtajo('este_mes', hoyArgentina()), comparar: 'mes_anterior' }))
  const [t, setT] = useState<DatosTablero | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  /** Una respuesta de un pedido anterior (más lento) se descarta. */
  const pedido = useRef(0)

  const cargar = useCallback(async (x: Filtros) => {
    const n = ++pedido.current
    setCargando(true); setError(null)
    try {
      const r = await fetch(`/api/metrics/tablero?${new URLSearchParams({ desde: x.rango.desde, hasta: x.rango.hasta, comparar: x.comparar })}`)
      const d = await r.json().catch(() => null)
      if (n !== pedido.current) return
      if (!r.ok || !d) throw new Error(d?.error ?? `No se pudo armar el tablero (error ${r.status}). Si el servidor tardó demasiado, probá de nuevo.`)
      setT(d)
    } catch (e) {
      if (n === pedido.current) setError(e instanceof Error ? e.message : 'No se pudo armar el tablero.')
    } finally { if (n === pedido.current) setCargando(false) }
  }, [])

  useEffect(() => { cargar(f) }, [f.rango.desde, f.rango.hasta, f.comparar, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const recargar = () => setVersion(v => v + 1)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="text-sm flex items-center gap-1.5">
          <span className="whitespace-nowrap text-muted-foreground">Período</span>
          <select className={sel} value={f.atajo} onChange={e => {
            const atajo = e.target.value as Filtros['atajo']
            setF(atajo === 'personalizado' ? { ...f, atajo } : { ...f, atajo, rango: rangoDeAtajo(atajo, hoyArgentina()) })
          }}>
            {ATAJOS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </label>
        {f.atajo === 'personalizado' && (
          <span className="flex items-center gap-1.5 text-sm">
            <input type="date" aria-label="Desde" className={sel} value={f.rango.desde} max={f.rango.hasta} onChange={e => e.target.value && setF({ ...f, rango: { ...f.rango, desde: e.target.value } })} />
            <span className="text-muted-foreground">a</span>
            <input type="date" aria-label="Hasta" className={sel} value={f.rango.hasta} min={f.rango.desde} onChange={e => e.target.value && setF({ ...f, rango: { ...f.rango, hasta: e.target.value } })} />
          </span>
        )}
        <label className="text-sm flex items-center gap-1.5">
          <span className="whitespace-nowrap text-muted-foreground">Comparar con</span>
          <select className={sel} value={f.comparar} onChange={e => setF({ ...f, comparar: e.target.value as Comparar })}>
            {COMPARAR.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <Button size="icon" variant="ghost" onClick={recargar} disabled={cargando} aria-label="Actualizar">
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
        {t?.parametros.comparado && (
          <span className="text-xs text-muted-foreground tabular-n">
            {fechaCorta(t.parametros.rango.desde)} – {fechaCorta(t.parametros.rango.hasta)} contra {fechaCorta(t.parametros.comparado.desde)} – {fechaCorta(t.parametros.comparado.hasta)}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-4 flex flex-wrap items-center gap-3 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4" /> {error}
          <Button size="sm" variant="outline" onClick={recargar}><RefreshCw className="h-4 w-4 mr-1" />Reintentar</Button>
        </div>
      )}

      {!t && cargando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Armando el tablero…</div>}

      {t && (
        <div className={`space-y-3 ${cargando ? 'opacity-60 transition-opacity' : ''}`}>
          <Cabecera t={t} />
          <FranjaAnuncios t={t} onCambio={recargar} />
          <FranjaComercial t={t} />
          <FranjaPagina t={t} />
          <FranjaPropiedades t={t} />
          <FranjaPlata t={t} />
          <p className="text-xs text-muted-foreground">
            Fuera de todos los números: {t.excluidas.pruebas} registros de prueba, {t.excluidas.colegas} colegas y {t.excluidas.repetidas} pedidos repetidos.
          </p>
        </div>
      )}
    </div>
  )
}

function Cabecera({ t }: { t: DatosTablero }) {
  const c = t.cabecera
  const anio = c.anio.desde.slice(0, 4)
  const aviso = c.sinImpuestos ? 'sin impuestos cargados' : c.gastosAConfirmar ? 'gastos a confirmar' : null
  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="rounded-xl border bg-card p-4 min-w-0">
        <p className="text-xs text-muted-foreground flex items-center gap-1">Margen neto del período <DeDondeSale texto="Facturación − reparto − gastos de propiedades − gastos fijos prorrateados − impuestos − toda la publicidad (USD al blue de cada día)." /></p>
        <p className={`text-2xl font-semibold tabular-n ${c.margenNetoUsd < 0 ? 'text-rose-700 dark:text-rose-400' : ''}`}>{usd(c.margenNetoUsd)}</p>
        <p className="text-xs text-muted-foreground tabular-n">
          {c.metaMesUsd != null ? <>meta del mes {usd(c.metaMesUsd)} · {pct(c.margenNetoUsd / c.metaMesUsd, 0)}</> : null}
          {aviso && <span className="text-amber-700 dark:text-amber-400">{c.metaMesUsd != null ? ' · ' : ''}{aviso}</span>}
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4 min-w-0">
        <p className="text-xs text-muted-foreground flex items-center gap-1">Margen neto {anio} <DeDondeSale texto={`La misma cuenta, del 1 de enero al ${fechaCorta(c.anio.hasta)}.`} /></p>
        <p className={`text-2xl font-semibold tabular-n ${c.margenNetoAnioUsd < 0 ? 'text-rose-700 dark:text-rose-400' : ''}`}>{usd(c.margenNetoAnioUsd)}</p>
      </div>
      <div className="rounded-xl border bg-card p-4 min-w-0">
        <p className="text-xs text-muted-foreground flex items-center gap-1">Facturado {anio} <DeDondeSale texto={`Honorarios cobrados de las ventas reservadas del 1 de enero al ${fechaCorta(c.anio.hasta)}.`} /></p>
        <p className="text-2xl font-semibold tabular-n">{usd(c.facturadoAnioUsd)}</p>
      </div>
    </section>
  )
}
