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
import { Check, Copy, Loader2, RefreshCw } from 'lucide-react'
import { DateRangePicker, type DateRange } from '@/components/metrics/DateRangePicker'

interface FunnelByDayRow {
  day: string
  visits: number
  conversions: number
}

interface FunnelMetrics {
  key: string
  label: string
  url: string
  visits: number
  conversions: number
  conversionPct: number
  byDay: FunnelByDayRow[]
}

interface FunnelsResponse {
  from: string
  to: string
  funnels: FunnelMetrics[]
}

function defaultRange(): DateRange {
  // 30d: ayer hacia atrás 30 días (inclusive), igual que el preset '30d'.
  const today = new Date()
  const to = new Date(today)
  to.setUTCDate(to.getUTCDate() - 1)
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
          <DateRangePicker value={range} onChange={setRange} defaultPreset="30d" />
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
