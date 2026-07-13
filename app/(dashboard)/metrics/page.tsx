'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateRangePicker, type DateRange } from '@/components/metrics/DateRangePicker'
import { FunnelChart } from '@/components/metrics/FunnelChart'
import { MetricsTable } from '@/components/metrics/MetricsTable'
import { CampaignBreakdown } from '@/components/metrics/CampaignBreakdown'
import { FunnelByDayChart } from '@/components/metrics/FunnelByDayChart'
import { CurrentStateBreakdown } from '@/components/metrics/CurrentStateBreakdown'
import { PropertyInquiriesPanel } from '@/components/metrics/PropertyInquiriesPanel'
import { SendTestReport } from '@/components/metrics/SendTestReport'
import type {
  MetricsComparison,
  FunnelMetrics,
  CampaignFunnelRow,
  FunnelDayRow,
  CurrentStateRow,
} from '@/lib/metrics/types'

function defaultRange(): DateRange {
  const today = new Date()
  const to = new Date(today); to.setUTCDate(to.getUTCDate() - 1)
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - 6)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export default function MetricsPage() {
  const [range, setRange] = useState<DateRange>(defaultRange())
  const [funnel, setFunnel] = useState<MetricsComparison<FunnelMetrics> | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignFunnelRow[]>([])
  const [byDay, setByDay] = useState<FunnelDayRow[]>([])
  const [currentState, setCurrentState] = useState<CurrentStateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = `?from=${range.from}&to=${range.to}`
      const [fRes, cRes, dRes, sRes] = await Promise.all([
        fetch(`/api/metrics/funnel${qs}`),
        fetch(`/api/metrics/funnel-by-campaign${qs}`),
        fetch(`/api/metrics/funnel-by-day${qs}`),
        fetch(`/api/metrics/current-state${qs}`),
      ])
      if (!fRes.ok) throw new Error(`funnel: ${fRes.status}`)
      const f = await fRes.json()
      const c = cRes.ok ? await cRes.json() : []
      const d = dRes.ok ? await dRes.json() : []
      const s = sRes.ok ? await sRes.json() : []
      setFunnel(f)
      setCampaigns(Array.isArray(c) ? c : [])
      setByDay(Array.isArray(d) ? d : [])
      setCurrentState(Array.isArray(s) ? s : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando métricas')
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Métricas</h1>
          <p className="text-sm text-muted-foreground">
            {range.from} a {range.to}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <Button variant="outline" size="icon" onClick={fetchAll} disabled={loading} aria-label="Refrescar">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Estado actual del pipeline</CardTitle>
          <p className="text-xs text-muted-foreground">
            Equivale a las cards del CRM. Mismos números si filtrás por la misma fecha.
          </p>
        </CardHeader>
        <CardContent>
          <CurrentStateBreakdown rows={currentState} />
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Embudo — eventos del período</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cuenta los eventos (agendamiento, visita, etc.) ocurridos en el rango, sin importar cuándo se creó el deal. Distinto del estado actual arriba.
            </p>
          </CardHeader>
          <CardContent>
            {funnel ? <FunnelChart metrics={funnel.current} /> : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comparativa vs período anterior</CardTitle>
            <p className="text-xs text-muted-foreground">Eventos en el rango actual vs el rango inmediatamente anterior del mismo tamaño.</p>
          </CardHeader>
          <CardContent>
            {funnel ? <MetricsTable data={funnel} /> : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Evolución diaria</CardTitle>
          <p className="text-xs text-muted-foreground">Eventos del embudo por día.</p>
        </CardHeader>
        <CardContent>
          <FunnelByDayChart rows={byDay} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rendimiento publicitario (Meta Ads)</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignBreakdown rows={campaigns} />
        </CardContent>
      </Card>

      <PropertyInquiriesPanel range={range} />

      <SendTestReport />
    </div>
  )
}
