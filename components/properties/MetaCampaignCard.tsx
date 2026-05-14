'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  ExternalLink,
  Pause,
  Play,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react'

interface Campaign {
  id: string
  campaign_id: string
  status: string
  budget_daily: number | null
  budget_currency: string | null
  landing_url: string | null
  created_at: string
  paused_at: string | null
  last_error: string | null
}

interface MetricPoint {
  date: string
  impressions: number
  clicks: number
  ctr: number | null
  spend: number
  leads: number
  cost_per_lead: number | null
  reach: number
}

function statusBadge(status: string) {
  switch (status) {
    case 'active':
      return { icon: CheckCircle, color: 'bg-emerald-600/90 text-white', label: 'Activa' }
    case 'paused':
      return { icon: Pause, color: 'bg-gray-500 text-white', label: 'Pausada' }
    case 'pending':
    case 'provisioning':
      return { icon: Clock, color: 'bg-amber-500 text-white', label: 'Provisioning…' }
    case 'failed':
      return { icon: AlertTriangle, color: 'bg-[color:var(--destructive)] text-white', label: 'Falló' }
    case 'archived':
      return { icon: AlertTriangle, color: 'bg-gray-400 text-white', label: 'Archivada' }
    default:
      return { icon: AlertTriangle, color: 'bg-gray-400 text-white', label: status }
  }
}

function sumMetrics(rows: MetricPoint[]) {
  return rows.reduce(
    (a, r) => ({
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      spend: a.spend + r.spend,
      leads: a.leads + r.leads,
      reach: a.reach + r.reach,
    }),
    { impressions: 0, clicks: 0, spend: 0, leads: 0, reach: 0 },
  )
}

export function MetaCampaignCard({
  propertyId,
  canManage,
}: {
  propertyId: string
  canManage: boolean
}) {
  const [data, setData] = useState<{ campaign: Campaign | null; metrics: MetricPoint[] } | null>(
    null,
  )
  const [days, setDays] = useState(30)
  const [acting, setActing] = useState(false)

  async function load() {
    try {
      const res = await fetch(`/api/properties/${propertyId}/meta-campaign?days=${days}`)
      if (res.ok) {
        const json = await res.json()
        setData({ campaign: json.campaign, metrics: json.metrics ?? [] })
      }
    } catch (err) {
      console.error('[meta-campaign] load failed', err)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, days])

  async function act(action: 'pause' | 'activate' | 'archive') {
    setActing(true)
    try {
      await fetch(`/api/properties/${propertyId}/meta-campaign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      await load()
    } finally {
      setActing(false)
    }
  }

  if (!data) return null

  if (!data.campaign) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="display text-base">Campaña Meta Ads</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Aún no se creó una campaña Meta. Se crea automáticamente cuando la propiedad
            se publica en algún portal y se asigna su landing pública.
          </p>
        </CardContent>
      </Card>
    )
  }

  const c = data.campaign
  const badge = statusBadge(c.status)
  const Icon = badge.icon
  const totals = sumMetrics(data.metrics)
  const fmtCurrency = c.budget_currency ?? 'ARS'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="display text-base">Campaña Meta Ads</CardTitle>
          <Badge className={`text-xs ${badge.color}`}>
            <Icon className="h-3 w-3 mr-1" />
            {badge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Budget diario</p>
            <p className="font-medium tabular-nums mt-0.5">
              {c.budget_daily
                ? `${fmtCurrency} ${c.budget_daily.toLocaleString('es-AR')}`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Lanzada</p>
            <p className="font-medium mt-0.5">
              {new Date(c.created_at).toLocaleDateString('es-AR')}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Campaign ID</p>
            <p className="font-mono text-xs mt-0.5 truncate" title={c.campaign_id}>
              {c.campaign_id}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Landing</p>
            {c.landing_url ? (
              <a
                href={c.landing_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs underline text-[color:var(--brand)] mt-0.5"
              >
                Abrir <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              '—'
            )}
          </div>
        </div>

        {c.last_error && (
          <p className="text-xs text-[color:var(--destructive)]">{c.last_error}</p>
        )}

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Rendimiento</h4>
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="text-xs border rounded px-2 py-1 bg-background"
            >
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
              <option value={90}>90 días</option>
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <Stat label="Impresiones" value={totals.impressions.toLocaleString('es-AR')} />
            <Stat label="Clicks" value={totals.clicks.toLocaleString('es-AR')} />
            <Stat label="Alcance" value={totals.reach.toLocaleString('es-AR')} />
            <Stat label="Leads" value={totals.leads.toLocaleString('es-AR')} />
            <Stat label={`Gasto ${fmtCurrency}`} value={Math.round(totals.spend).toLocaleString('es-AR')} />
          </div>
          {data.metrics.length === 0 && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Métricas se sincronizan cada 6 h una vez activa.
            </p>
          )}
        </div>

        {canManage && (c.status === 'active' || c.status === 'paused') && (
          <div className="flex gap-2 pt-2 border-t">
            {c.status === 'active' ? (
              <Button size="sm" variant="outline" onClick={() => act('pause')} disabled={acting}>
                <Pause className="h-4 w-4 mr-1" />
                Pausar campaña
              </Button>
            ) : (
              <Button size="sm" onClick={() => act('activate')} disabled={acting}>
                <Play className="h-4 w-4 mr-1" />
                Reactivar
              </Button>
            )}
            {acting && <Loader2 className="h-4 w-4 animate-spin self-center" />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-medium tabular-nums mt-0.5">{value}</p>
    </div>
  )
}
