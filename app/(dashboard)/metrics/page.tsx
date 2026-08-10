'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateRangePicker, type DateRange } from '@/components/metrics/DateRangePicker'
import { FunnelChart } from '@/components/metrics/FunnelChart'
import { MetricsTable } from '@/components/metrics/MetricsTable'
import { CampaignBreakdown } from '@/components/metrics/CampaignBreakdown'
import { FunnelByDayChart } from '@/components/metrics/FunnelByDayChart'
import { CurrentStateBreakdown } from '@/components/metrics/CurrentStateBreakdown'
import { PropertyInquiriesPanel } from '@/components/metrics/PropertyInquiriesPanel'
import { SendTestReport } from '@/components/metrics/SendTestReport'
import { EstadoResultadosEmbudo, type InversionPorCampana } from '@/components/metrics/EstadoResultadosEmbudo'
import { CostosPanel, type VolumenPorOrigen } from '@/components/metrics/CostosPanel'
import { CoberturaAsesoresPanel } from '@/components/metrics/CoberturaAsesoresPanel'
import type { StatementStage, FunnelCosts } from '@/lib/metrics/funnel-insights'
import type {
  MetricsComparison,
  FunnelMetrics,
  CampaignFunnelRow,
  FunnelDayRow,
  CurrentStateRow,
} from '@/lib/metrics/types'

/** El status crudo (`funnel: 401`) no le dice nada a quien lo lee. */
function mensajeDeError(status: number): string {
  if (status === 401 || status === 403) return 'Se venció la sesión. Volvé a entrar.'
  return `No se pudieron traer las métricas del embudo (error ${status}).`
}

/**
 * Lo que va en una tarjeta que NO tiene datos. Distingue las tres situaciones:
 * un spinner solo se muestra cuando hay una carga EN CURSO — antes giraba para
 * siempre después de un fallo, afirmando una carga que no existía.
 */
function PanelSinDatos({
  cargando,
  error,
  onReintentar,
}: {
  cargando: boolean
  error: string | null
  onReintentar: () => void
}) {
  if (cargando) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  }
  if (error) {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </p>
        <Button variant="outline" size="sm" onClick={onReintentar}>
          <RefreshCw className="h-4 w-4 mr-1" /> Reintentar
        </Button>
      </div>
    )
  }
  return <p className="text-sm text-muted-foreground">Sin datos para este período.</p>
}

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
  const [insights, setInsights] = useState<{
    etapas: StatementStage[]
    inversion: InversionPorCampana[]
    costs: FunnelCosts | null
    porOrigen: VolumenPorOrigen[]
    asesores: { total: number; con_asesor: number; por_mes: { mes: string; total: number; con_asesor: number }[] }
  } | null>(null)

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
      if (!fRes.ok) throw new Error(mensajeDeError(fRes.status))
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

    // El estado de resultados es independiente: si esta llamada falla, el resto
    // de la pantalla tiene que seguir funcionando.
    try {
      const r = await fetch(`/api/funnels/insights?from=${range.from}&to=${range.to}`)
      setInsights(r.ok ? await r.json() : null)
    } catch {
      setInsights(null)
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

      {/* ── El estado de resultados va PRIMERO: es la lectura del negocio.
             Lo de abajo es el detalle operativo de siempre. ────────────────── */}
      <EstadoResultadosEmbudo
        etapas={insights?.etapas ?? []}
        inversion={insights?.inversion ?? []}
        costs={insights?.costs ?? null}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <CostosPanel costs={insights?.costs ?? null} porOrigen={insights?.porOrigen ?? []} />
        {insights?.asesores && <CoberturaAsesoresPanel data={insights.asesores} />}
      </section>

      <div className="border-t pt-2">
        <p className="eyebrow">Detalle operativo</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estado actual del pipeline</CardTitle>
          {/* La copia decía "Mismos números si filtrás por la misma fecha" y desde
              que el CRM pasó a cortar el día en hora argentina eso ya no es cierto:
              este panel corta en UTC (las RPC hacen `created_at::date` con la sesión
              de Postgres en UTC). Sobre la base real, 126 de 819 deals caen en un día
              distinto según qué criterio se use. No se tocan las RPC — moverlas
              cambiaría cifras históricas —, así que la pantalla dice con qué mide. */}
          <p className="text-xs text-muted-foreground">
            Deals creados en el rango, agrupados por la etapa en la que están hoy.
            Este panel corta el día en horario UTC y el CRM lo corta en hora argentina:
            cerca del cambio de día un mismo proceso puede caer en una fecha u otra, así
            que los totales no siempre dan idénticos.
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
            {funnel
              ? <FunnelChart metrics={funnel.current} />
              : <PanelSinDatos cargando={loading} error={error} onReintentar={fetchAll} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comparativa vs período anterior</CardTitle>
            <p className="text-xs text-muted-foreground">Eventos en el rango actual vs el rango inmediatamente anterior del mismo tamaño.</p>
          </CardHeader>
          <CardContent>
            {funnel
              ? <MetricsTable data={funnel} />
              : <PanelSinDatos cargando={loading} error={error} onReintentar={fetchAll} />}
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
