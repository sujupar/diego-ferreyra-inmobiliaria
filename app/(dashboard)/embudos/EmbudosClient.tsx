'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Copy, Loader2, RefreshCw, Flame } from 'lucide-react'
import { DateRangePicker, type DateRange } from '@/components/metrics/DateRangePicker'

// Mapa de calor (Microsoft Clarity) — el dashboard vive en Clarity; linkeamos a él.
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? ''

interface FunnelByDayRow {
  day: string
  visits: number
  conversions: number
}

interface VideoStatRow {
  funnel: string
  video_key: string
  segment: string
  stage: string | null
  viewers: number
  avg_max_percent: number | null
  avg_attention: number | null
  completed: number
  q25: number
  q50: number
  q75: number
  q95: number
  q100: number
}

interface CampaignRow {
  campaign: string
  visits: number
  conversions: number
  pct: number
  spend: number
  cpa: number | null
}

// v1: histograma de profundidad (dónde dejó de ver cada uno)
interface RetentionRow {
  funnel: string
  video_key: string
  segment: string
  stage: string | null
  percent: number
  viewers: number
}
// v2: retención momento a momento (qué % vio cada tramo)
interface HeatmapRow {
  funnel: string
  video_key: string
  segment: string
  stage: string | null
  bucket: number
  viewers: number
}

interface FunnelMetrics {
  key: string
  label: string
  url: string
  visits: number
  conversions: number
  conversionPct: number
  byDay: FunnelByDayRow[]
  videoRows?: VideoStatRow[]
  retentionRows?: RetentionRow[]
  heatmapRows?: HeatmapRow[]
  byCampaign?: CampaignRow[]
}

interface FunnelsResponse {
  from: string
  to: string
  funnels: FunnelMetrics[]
}

function defaultRange(): DateRange {
  // 30 días INCLUYENDO hoy: la analítica de video/visitas es en tiempo real, así
  // que lo de hoy debe contar (a diferencia de /metrics, que corta en ayer).
  // Normalizamos a medianoche UTC con Date.UTC para no tener bug de huso horario.
  const now = new Date()
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - 29)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

function fmtDay(d: string): string {
  // YYYY-MM-DD → DD/MM
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

const NUM = new Intl.NumberFormat('es-AR')

function FunnelByDayChart({ rows }: { rows: FunnelByDayRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos para el rango.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0fb" />
        <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip labelFormatter={((d: unknown) => fmtDay(String(d))) as never} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="visits"
          name="Visitas"
          stroke="#2A3B84"
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="conversions"
          name="Conversiones"
          stroke="#10B981"
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard puede fallar (permiso/contexto inseguro); no rompemos la UI.
    }
  }, [url])

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copy}
      aria-label="Copiar enlace público"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copiado' : 'Copiar'}
    </Button>
  )
}

const STAGE_LABELS: Record<string, string> = {
  request: 'Solicitud',
  scheduled: 'Coordinada',
  not_visited: 'No realizada',
  visited: 'Visita realizada',
  appraisal_sent: 'Tasación entregada',
  followup: 'Seguimiento',
  captured: 'Captada',
  lost: 'Descartado',
  clase_gratuita: 'Clase gratuita',
  comprador: 'Comprador',
}
const VIDEO_LABELS: Record<string, string> = {
  'hero-tasacion': 'Video del hero',
  'hero-clase': 'Video del hero',
  'clase-completa': 'Clase completa (página de gracias)',
}

interface VideoAgg {
  viewers: number
  attention: number | null
  depth: number | null
  completed: number
  q: [number, number, number, number, number]
}

function aggregateVideo(rows: VideoStatRow[]): VideoAgg {
  let viewers = 0, attW = 0, attN = 0, depW = 0, depN = 0, completed = 0
  const q: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  for (const r of rows) {
    viewers += r.viewers
    completed += r.completed
    if (r.avg_attention != null) { attW += r.avg_attention * r.viewers; attN += r.viewers }
    if (r.avg_max_percent != null) { depW += r.avg_max_percent * r.viewers; depN += r.viewers }
    q[0] += r.q25; q[1] += r.q50; q[2] += r.q75; q[3] += r.q95; q[4] += r.q100
  }
  return {
    viewers,
    attention: attN > 0 ? Math.round((attW / attN) * 10) / 10 : null,
    depth: depN > 0 ? Math.round((depW / depN) * 10) / 10 : null,
    completed,
    q,
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums">{value}</p>
    </div>
  )
}

function matchesFilter(row: { segment: string; stage: string | null }, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'anon') return row.segment === 'no_registrado'
  if (filter === 'reg') return row.segment === 'registrado'
  if (filter.startsWith('stage:')) return row.segment === 'registrado' && row.stage === filter.slice(6)
  return true
}

/** % de profundidad bajo el cual quedó la mitad de los espectadores (mediana de max_percent). */
function medianDepth(rows: { percent: number; viewers: number }[], total: number): number | null {
  if (total <= 0) return null
  const sorted = [...rows].sort((a, b) => a.percent - b.percent)
  let acc = 0
  for (const r of sorted) {
    acc += r.viewers
    if (acc >= total / 2) return r.percent
  }
  return sorted.length ? sorted[sorted.length - 1].percent : null
}

function VideoAnalytics({
  stats,
  retention,
  heatmap,
}: {
  stats: VideoStatRow[]
  retention: RetentionRow[]
  heatmap: HeatmapRow[]
}) {
  const [filter, setFilter] = useState('all')
  const [res, setRes] = useState(5)

  if (stats.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos de video para el rango.</p>
  }

  const stages = Array.from(
    new Set(stats.filter((r) => r.segment === 'registrado' && r.stage).map((r) => r.stage as string)),
  )
  const sFiltered = stats.filter((r) => matchesFilter(r, filter))
  const rFiltered = retention.filter((r) => matchesFilter(r, filter))
  const hFiltered = heatmap.filter((r) => matchesFilter(r, filter))
  const videoKeys = Array.from(new Set(sFiltered.map((r) => r.video_key)))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Retención de video (% que ve cada tramo)</p>
        <div className="flex items-center gap-2">
          <select
            value={res}
            onChange={(e) => setRes(Number(e.target.value))}
            className="rounded-md border bg-background px-2 py-1 text-xs"
            aria-label="Resolución de la curva"
          >
            <option value={10}>cada 10%</option>
            <option value={5}>cada 5%</option>
            <option value={1}>cada 1%</option>
          </select>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-xs"
            aria-label="Filtrar por segmento o etapa"
          >
            <option value="all">Todos</option>
            <option value="anon">No registrados</option>
            <option value="reg">Registrados</option>
            {stages.map((s) => (
              <option key={s} value={`stage:${s}`}>{`Etapa: ${STAGE_LABELS[s] || s}`}</option>
            ))}
          </select>
        </div>
      </div>
      {videoKeys.length === 0 && (
        <p className="text-xs text-muted-foreground">Sin datos para este filtro.</p>
      )}
      {videoKeys.map((vk) => {
        const agg = aggregateVideo(sFiltered.filter((r) => r.video_key === vk))
        const total = agg.viewers
        const pctOf = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

        // v2 — curva momento a momento: viewers por bucket (0..99) a la resolución elegida.
        const perBucket = new Array<number>(100).fill(0)
        for (const r of hFiltered) if (r.video_key === vk) perBucket[r.bucket] += r.viewers
        const curve: { x: number; pct: number }[] = []
        for (let p = 0; p < 100; p += res) {
          let sum = 0
          let n = 0
          for (let b = p; b < Math.min(100, p + res); b++) { sum += perBucket[b]; n++ }
          const avg = n > 0 ? sum / n : 0
          curve.push({ x: p, pct: total > 0 ? Math.round((avg / total) * 1000) / 10 : 0 })
        }

        // v1 — abandono por profundidad (max_percent): mediana + mayor caída de la curva.
        const percents = rFiltered
          .filter((r) => r.video_key === vk)
          .map((r) => ({ percent: r.percent, viewers: r.viewers }))
        const totalDrop = percents.reduce((s, r) => s + r.viewers, 0)
        const median = medianDepth(percents, totalDrop)
        let dropFrom = 0, dropTo = 0, dropMax = 0
        for (let i = 0; i < curve.length - 1; i++) {
          const d = curve[i].pct - curve[i + 1].pct
          if (d > dropMax) { dropMax = d; dropFrom = curve[i].x; dropTo = curve[i + 1].x }
        }

        return (
          <div key={vk} className="rounded-lg border p-3">
            <p className="text-sm font-medium">{VIDEO_LABELS[vk] || vk}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Stat label="Vistas" value={NUM.format(agg.viewers)} />
              <Stat label="Atención media" value={agg.attention != null ? `${agg.attention}%` : '—'} />
              <Stat label="Profundidad media" value={agg.depth != null ? `${agg.depth}%` : '—'} />
              <Stat label="Completaron" value={`${pctOf(agg.completed)}%`} />
            </div>
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={curve} margin={{ top: 6, right: 12, left: -8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0fb" />
                  <XAxis dataKey="x" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} width={36} />
                  <Tooltip
                    formatter={((val: unknown) => [`${val}% viendo`, '']) as never}
                    labelFormatter={((l: unknown) => `Punto ${l}% del video`) as never}
                  />
                  <Line type="monotone" dataKey="pct" name="% viendo" stroke="#2A3B84" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {median != null && (
                <span>La mitad de la audiencia no pasó del <b className="text-foreground">{median}%</b></span>
              )}
              {dropMax > 0 && (
                <span>Mayor caída entre <b className="text-foreground">{dropFrom}%</b> y <b className="text-foreground">{dropTo}%</b></span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos de campaña para el rango.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1 pr-2">Campaña</th>
            <th className="px-2 py-1 text-right">Visitas</th>
            <th className="px-2 py-1 text-right">Conv.</th>
            <th className="py-1 pl-2 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.campaign} className="border-b last:border-0">
              <td className="max-w-[220px] truncate py-1 pr-2" title={c.campaign}>{c.campaign}</td>
              <td className="px-2 py-1 text-right tabular-nums">{NUM.format(c.visits)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{NUM.format(c.conversions)}</td>
              <td className="py-1 pl-2 text-right tabular-nums">{c.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FunnelCard({ funnel }: { funnel: FunnelMetrics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{funnel.label}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={funnel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline-offset-4 hover:underline break-all"
          >
            {funnel.url}
          </a>
          <CopyLinkButton url={funnel.url} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Visitas</p>
            <p className="text-3xl font-bold tabular-nums">{NUM.format(funnel.visits)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Conversiones</p>
            <p className="text-3xl font-bold tabular-nums">{NUM.format(funnel.conversions)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">% Conversión</p>
            <p className="text-3xl font-bold tabular-nums">{funnel.conversionPct}%</p>
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Visitas vs conversiones por día</p>
          <FunnelByDayChart rows={funnel.byDay} />
        </div>
        <div className="border-t pt-4">
          <VideoAnalytics
            stats={funnel.videoRows ?? []}
            retention={funnel.retentionRows ?? []}
            heatmap={funnel.heatmapRows ?? []}
          />
        </div>
        <div className="border-t pt-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Por campaña</p>
          <CampaignTable rows={funnel.byCampaign ?? []} />
        </div>
      </CardContent>
    </Card>
  )
}

export function EmbudosClient() {
  const [range, setRange] = useState<DateRange>(defaultRange())
  const [funnels, setFunnels] = useState<FunnelMetrics[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/funnels/metrics?from=${range.from}&to=${range.to}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ? String(body.error) : `Error ${res.status}`)
      }
      const data: FunnelsResponse = await res.json()
      setFunnels(Array.isArray(data.funnels) ? data.funnels : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando embudos')
      setFunnels([])
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Embudos</h1>
          <p className="text-sm text-muted-foreground">
            {range.from} a {range.to}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {CLARITY_ID && (
            <a
              href={`https://clarity.microsoft.com/projects/view/${CLARITY_ID}/dashboard`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm transition hover:bg-muted"
            >
              <Flame className="h-4 w-4 text-orange-500" />
              Ver mapa de calor
            </a>
          )}
          <DateRangePicker value={range} onChange={setRange} defaultPreset="30d" includeToday />
          <Button
            variant="outline"
            size="icon"
            onClick={fetchAll}
            disabled={loading}
            aria-label="Refrescar"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading && funnels.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {funnels.map((f) => (
            <FunnelCard key={f.key} funnel={f} />
          ))}
        </section>
      )}

      {!loading && !error && funnels.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay embudos para mostrar.</p>
      )}
    </div>
  )
}
