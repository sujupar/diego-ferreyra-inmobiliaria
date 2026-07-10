'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateRangePicker, type DateRange } from '@/components/metrics/DateRangePicker'

/**
 * Visor del mapa de calor SOBRE la landing real: embebe la página con
 * ?hm_preview=1 (tracking apagado) y le manda por postMessage las métricas del
 * rango/segmento/dispositivo elegidos. El overlay (HeatmapOverlay, dentro de la
 * landing) dibuja el calor + badges por sección encima de la página de verdad.
 */

interface SectionRow { section: string; segment: string; stage: string | null; device: string; reached: number; avg_visible_ms: number; clicks: number }
interface TotalRow { segment: string; stage: string | null; device: string; sessions: number; avg_scroll: number }
interface GridRow { section: string; segment: string; device: string; x_bin: number; y_bin: number; clicks: number; rage: number }

interface HeatmapData {
  totals: TotalRow[]
  sections: SectionRow[]
  grid: GridRow[]
}

const STAGE_LABELS: Record<string, string> = {
  request: 'Solicitud', scheduled: 'Coordinada', not_visited: 'No realizada', visited: 'Visita realizada',
  appraisal_sent: 'Tasación entregada', followup: 'Seguimiento', captured: 'Captada', lost: 'Descartado',
  clase_gratuita: 'Clase gratuita', comprador: 'Comprador',
}
const NUM = new Intl.NumberFormat('es-AR')

// Ancho del iframe según el dispositivo filtrado → la landing reflowea a ese
// layout y el calor (relativo a cada sección) cae donde correspondería.
const DEVICE_WIDTH: Record<string, string> = { mobile: '390px', tablet: '768px', desktop: '100%', all: '100%' }

function defaultRange(): DateRange {
  const now = new Date()
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - 29)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

function matchSeg(row: { segment: string; stage?: string | null }, f: string): boolean {
  if (f === 'all') return true
  if (f === 'anon') return row.segment === 'no_registrado'
  if (f === 'reg') return row.segment === 'registrado'
  if (f.startsWith('stage:')) return row.segment === 'registrado' && row.stage === f.slice(6)
  return true
}
const matchDev = (d: string, f: string) => f === 'all' || d === f

export function HeatmapViewerClient({ page, label, slug }: { page: string; label: string; slug: string }) {
  const [range, setRange] = useState<DateRange>(defaultRange())
  const [seg, setSeg] = useState('all')
  const [dev, setDev] = useState('all')
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [frameH, setFrameH] = useState(2400)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const readyRef = useRef(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/funnels/heatmap?page=${page}&from=${range.from}&to=${range.to}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ? String(body.error) : `Error ${res.status}`)
      }
      setData((await res.json()) as HeatmapData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando el mapa de calor')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [page, range.from, range.to])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Agregación con los filtros actuales (misma lógica que el panel).
  const computed = useMemo(() => {
    if (!data) return null
    const totalSessions = data.totals
      .filter((t) => matchSeg(t, seg) && matchDev(t.device, dev))
      .reduce((s, t) => s + t.sessions, 0)
    const avgScrollW = data.totals
      .filter((t) => matchSeg(t, seg) && matchDev(t.device, dev))
      .reduce((s, t) => s + Number(t.avg_scroll) * t.sessions, 0)
    const avgScroll = totalSessions > 0 ? Math.round((avgScrollW / totalSessions) * 10) / 10 : 0

    const byKey = new Map<string, { reached: number; msW: number; clicks: number }>()
    for (const r of data.sections) {
      if (!matchSeg(r, seg) || !matchDev(r.device, dev)) continue
      let acc = byKey.get(r.section)
      if (!acc) {
        acc = { reached: 0, msW: 0, clicks: 0 }
        byKey.set(r.section, acc)
      }
      acc.reached += r.reached
      acc.msW += Number(r.avg_visible_ms) * r.reached
      acc.clicks += r.clicks
    }
    const sections = [...byKey.entries()].map(([key, v]) => ({
      key,
      reachedPct: totalSessions > 0 ? Math.round((v.reached / totalSessions) * 100) : 0,
      avgSec: v.reached > 0 ? Math.round(v.msW / v.reached / 100) / 10 : 0,
      clicks: v.clicks,
    }))

    // La grilla no tiene stage: para filtros por etapa usamos 'registrado'.
    const gridSeg = seg.startsWith('stage:') ? 'reg' : seg
    const cellMap = new Map<string, { section: string; x_bin: number; y_bin: number; clicks: number; rage: number }>()
    for (const g of data.grid) {
      if (!matchSeg({ segment: g.segment }, gridSeg) || !matchDev(g.device, dev)) continue
      const k = `${g.section}|${g.x_bin}|${g.y_bin}`
      const cur = cellMap.get(k)
      if (cur) {
        cur.clicks += g.clicks
        cur.rage += g.rage
      } else {
        cellMap.set(k, { section: g.section, x_bin: g.x_bin, y_bin: g.y_bin, clicks: g.clicks, rage: g.rage })
      }
    }
    return { totalSessions, avgScroll, sections, grid: [...cellMap.values()] }
  }, [data, seg, dev])

  // Enviar las métricas al overlay (cuando esté listo y cuando cambien).
  const postToOverlay = useCallback(() => {
    if (!readyRef.current || !computed) return
    const win = iframeRef.current?.contentWindow
    if (!win) return
    try {
      win.postMessage(
        { type: 'df-heatmap-data', sections: computed.sections, grid: computed.grid },
        window.location.origin,
      )
    } catch {
      /* iframe aún no disponible */
    }
  }, [computed])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data as { type?: string; height?: number } | null
      if (d?.type === 'df-heatmap-ready') {
        readyRef.current = true
        postToOverlay()
      } else if (d?.type === 'df-heatmap-height' && typeof d.height === 'number' && d.height > 200) {
        setFrameH(Math.min(d.height, 20000))
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [postToOverlay])

  useEffect(() => {
    postToOverlay()
  }, [postToOverlay])

  const stages = useMemo(
    () =>
      Array.from(
        new Set((data?.totals ?? []).filter((t) => t.segment === 'registrado' && t.stage).map((t) => t.stage as string)),
      ),
    [data],
  )

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/embudos" className="text-muted-foreground hover:text-foreground" aria-label="Volver a Embudos">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Mapa de calor — {label}</h1>
            <p className="text-sm text-muted-foreground">
              {range.from} a {range.to}
              {computed && (
                <> · {NUM.format(computed.totalSessions)} sesiones · scroll medio {computed.avgScroll}%</>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dev}
            onChange={(e) => setDev(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
            aria-label="Dispositivo"
          >
            <option value="all">Todo dispositivo</option>
            <option value="desktop">Escritorio</option>
            <option value="mobile">Mobile</option>
            <option value="tablet">Tablet</option>
          </select>
          <select
            value={seg}
            onChange={(e) => setSeg(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
            aria-label="Segmento"
          >
            <option value="all">Todos</option>
            <option value="anon">No registrados</option>
            <option value="reg">Registrados</option>
            {stages.map((s) => (
              <option key={s} value={`stage:${s}`}>{`Etapa: ${STAGE_LABELS[s] || s}`}</option>
            ))}
          </select>
          <DateRangePicker value={range} onChange={setRange} defaultPreset="30d" includeToday />
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading} aria-label="Refrescar">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}
      {computed && computed.totalSessions === 0 && !loading && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Sin sesiones para este rango/filtro. La página se muestra igual, sin calor encima.
        </div>
      )}

      {/* La landing REAL embebida (con tracking apagado) + overlay de calor encima. */}
      <div className="overflow-x-auto rounded-xl border bg-muted/30 p-3">
        <div className="mx-auto transition-all" style={{ width: DEVICE_WIDTH[dev] ?? '100%', maxWidth: '100%' }}>
          <iframe
            ref={iframeRef}
            src={`/${slug}?hm_preview=1`}
            title={`Mapa de calor — ${label}`}
            className="w-full rounded-lg border bg-white shadow-sm"
            style={{ height: frameH }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Es la página real en vivo (la visita del visor no cuenta en las métricas). Más rojo = más clics.
        El ancho cambia según el dispositivo filtrado para ver el calor sobre el layout correspondiente.
      </p>
    </div>
  )
}
