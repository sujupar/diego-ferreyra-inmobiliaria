'use client'

/**
 * Tablero de /metrics con la estructura del documento "Métricas del mes" (pedido
 * del dueño, 2026-11-21): filtros, contra qué se compara (con fechas), ocho
 * números y cuatro secciones. Spec: docs/superpowers/specs/2026-11-21-tablero-estructura-del-mes-design.md
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ModoComparacion, Tablero as DatosTablero } from '@/lib/metrics/tablero/servidor'
import { hoyArgentina, mesAntes, rangoDeAtajo, type Atajo, type Rango } from '@/lib/metrics/panel/rango'
import { num, usd } from '@/components/metrics/panel/formato'
import { Cuadro } from './ui'
import { rangoCorto } from './rango-corto'
import { SeccionTasacion } from './SeccionTasacion'
import { SeccionCampanias } from './SeccionCampanias'
import { SeccionConsultas, SeccionPlata } from './SeccionResto'

interface Filtros { atajo: Atajo | 'personalizado'; rango: Rango; comparar: ModoComparacion; mes: string }

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
const COMPARAR: { key: ModoComparacion; label: string }[] = [
  { key: 'mes_anterior', label: 'Mismo tramo del mes anterior' },
  { key: 'mes', label: 'Un mes que elijo…' },
  { key: 'mejor_mes', label: 'El mejor mes del año' },
  { key: 'anio_pasado', label: 'Mismo período del año pasado' },
  { key: 'anterior', label: 'Período anterior' },
  { key: 'ninguno', label: 'Nada' },
]
const sel = 'rounded-md border px-2 py-1.5 text-sm bg-background'

export function Tablero() {
  const [f, setF] = useState<Filtros>(() => {
    const hoy = hoyArgentina()
    return { atajo: 'este_mes', rango: rangoDeAtajo('este_mes', hoy), comparar: 'mes_anterior', mes: mesAntes(hoy).slice(0, 7) }
  })
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
      const q = new URLSearchParams({ desde: x.rango.desde, hasta: x.rango.hasta, comparar: x.comparar })
      if (x.comparar === 'mes') q.set('mes', x.mes)
      const r = await fetch(`/api/metrics/tablero?${q}`)
      const d = await r.json().catch(() => null)
      if (n !== pedido.current) return
      if (!r.ok || !d) throw new Error(d?.error ?? `No se pudo armar el tablero (error ${r.status}). Si el servidor tardó demasiado, probá de nuevo.`)
      setT(d)
    } catch (e) {
      if (n === pedido.current) setError(e instanceof Error ? e.message : 'No se pudo armar el tablero.')
    } finally { if (n === pedido.current) setCargando(false) }
  }, [])

  useEffect(() => { cargar(f) }, [f.rango.desde, f.rango.hasta, f.comparar, f.mes, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const recargar = () => setVersion(v => v + 1)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
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
            <select className={sel} value={f.comparar} onChange={e => setF({ ...f, comparar: e.target.value as ModoComparacion })}>
              {COMPARAR.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          {f.comparar === 'mes' && (
            <input type="month" aria-label="Mes para comparar" className={sel} value={f.mes} max={hoyArgentina().slice(0, 7)} onChange={e => e.target.value && setF({ ...f, mes: e.target.value })} />
          )}
          <Button size="icon" variant="ghost" onClick={recargar} disabled={cargando} aria-label="Actualizar">
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
        {t && <Encabezado t={t} />}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-4 flex flex-wrap items-center gap-3 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4" /> {error}
          <Button size="sm" variant="outline" onClick={recargar}><RefreshCw className="h-4 w-4 mr-1" />Reintentar</Button>
        </div>
      )}

      {!t && cargando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Armando el tablero…</div>}

      {t && (
        <div className={`space-y-8 ${cargando ? 'opacity-60 transition-opacity' : ''}`}>
          <Numeros t={t} />
          <SeccionTasacion t={t} onCambio={recargar} />
          <SeccionCampanias t={t} />
          <SeccionConsultas t={t} />
          <SeccionPlata t={t} />
          <p className="text-xs text-muted-foreground">
            Fuera de todos los números: {t.excluidas.pruebas} registros de prueba, {t.excluidas.colegas} colegas y {t.excluidas.repetidas} pedidos repetidos.
            Meta: gasto sin impuestos; USD al dólar blue de cada día.
          </p>
        </div>
      )}
    </div>
  )
}

/** Contra qué se compara, siempre con fechas. */
function Encabezado({ t }: { t: DatosTablero }) {
  const c = t.comparacion
  return (
    <p className="text-sm tabular-n">
      <strong>{rangoCorto(t.parametros.rango)}</strong>
      {c.rango
        ? <> contra <strong>{rangoCorto(c.rango)}</strong> <span className="text-muted-foreground">· {c.etiqueta}{c.costoPorSolicitudMejorMesUsd != null && ` (${usd(c.costoPorSolicitudMejorMesUsd, 1)} por solicitud)`}</span></>
        : c.motivo ? <span className="text-amber-700 dark:text-amber-400"> · {c.motivo}</span> : <span className="text-muted-foreground"> · sin comparar</span>}
    </p>
  )
}

function Numeros({ t }: { t: DatosTablero }) {
  const comp = t.comparacion.rango
  const corto = comp ? rangoCorto(comp) : ''
  const ant = (texto: string | null) => (comp && texto != null ? `${corto}: ${texto}` : undefined)
  const im = t.inversionMeta, a = t.tasacion.actual, b = t.tasacion.anterior
  const reg = t.registros, cons = t.consultas, pr = t.propiedades, pl = t.plata
  const usdArs = (u: number | null | undefined, ar: number | null | undefined, d = 0) => (u == null ? 'sin dato' : `${usd(u, d)}${ar != null ? ` · $ ${num(ar)}` : ''}`)
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <Cuadro titulo="Inversión en Meta" valor={usd(im.actual?.usd)} sub={im.actual ? `$ ${num(im.actual.ars)}` : undefined} antes={ant(im.anterior ? usdArs(im.anterior.usd, im.anterior.ars) : comp ? 'sin dato' : null)}
        fuente="Todas las campañas de Meta (tasación, clase y propiedades), sin impuestos. USD al dólar blue de cada día." />
      <Cuadro titulo="Registros de tasación" valor={num(a?.registros)} antes={ant(b ? num(b.registros) : comp ? 'sin dato' : null)}
        fuente="Registros que cuenta el píxel de Meta en la campaña de tasación (lo que optimizan los conjuntos)." />
      <Cuadro destacado titulo="Costo por registro de tasación" valor={usd(a?.costoPorRegistroUsd, 1)} sub={a?.costoPorRegistro != null ? `$ ${num(a.costoPorRegistro)}` : undefined}
        antes={ant(b ? usdArs(b.costoPorRegistroUsd, b.costoPorRegistro, 1) : comp ? 'sin dato' : null)} fuente="Inversión de la campaña de tasación ÷ registros del píxel." />
      <Cuadro titulo="Registros en propiedades" valor={num(reg.actual.total)} sub={`${num(reg.actual.personas)} ${reg.actual.personas === 1 ? 'persona' : 'personas'}`}
        antes={ant(reg.anterior ? num(reg.anterior.total) : comp ? 'sin dato' : null)} fuente="Registros en las fichas públicas de las propiedades, sin robots ni borrados." />
      <Cuadro titulo="Consultas de portales" valor={num(cons.actual.total)} antes={ant(cons.anterior ? num(cons.anterior.total) : comp ? 'sin dato' : null)} fuente="Consultas de Zonaprop, Argenprop y MercadoLibre, por fecha de recepción." />
      <Cuadro titulo="Propiedades captadas" valor={num(pr.actual.captadas)} antes={ant(pr.anterior ? num(pr.anterior.captadas) : null)} />
      <Cuadro titulo="Reservas" valor={num(pr.actual.reservas)} antes={ant(pr.anterior ? num(pr.anterior.reservas) : null)} />
      <Cuadro alerta={pl.actual.margenNetoUsd < 0} titulo="Margen neto" valor={usd(pl.actual.margenNetoUsd)} antes={ant(pl.anterior ? usd(pl.anterior.margenNetoUsd) : comp ? 'sin dato' : null)}
        fuente="Facturación − comisiones − gastos de propiedades − gastos fijos prorrateados − impuestos − toda la publicidad." />
    </section>
  )
}
