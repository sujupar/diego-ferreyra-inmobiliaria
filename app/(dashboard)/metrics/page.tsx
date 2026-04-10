'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BarChart3, TrendingUp, Home, Users, Phone, Loader2, RefreshCw } from 'lucide-react'

interface CommercialActions {
  tasaciones_solicitadas: number
  tasaciones_coordinadas: number
  tasaciones_realizadas: number
  captaciones: number
}

interface CallStats {
  total_calls: number
  answered_calls: number
  missed_calls: number
}

interface PipelineStage {
  stage_name: string
  contact_count: number
  new_contacts: number
  opportunity_value: number
}

function getDateRange(days: number) {
  const to = new Date()
  to.setDate(to.getDate() - 1)
  const from = new Date(to)
  from.setDate(from.getDate() - days + 1)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

export default function MetricsPage() {
  const [range, setRange] = useState<'7' | '30' | 'custom'>('30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [commercialActions, setCommercialActions] = useState<CommercialActions | null>(null)
  const [callStats, setCallStats] = useState<CallStats | null>(null)
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([])
  const [totalNewContacts, setTotalNewContacts] = useState(0)
  const [metaLeads, setMetaLeads] = useState(0)
  const [metaSpend, setMetaSpend] = useState(0)

  const getEffectiveRange = useCallback(() => {
    if (range === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo }
    return getDateRange(range === '7' ? 7 : 30)
  }, [range, customFrom, customTo])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { from, to } = getEffectiveRange()

    try {
      const [metaRes, ghlRes] = await Promise.all([
        fetch(`/api/marketing/meta?from=${from}&to=${to}`),
        fetch(`/api/marketing/ghl?from=${from}&to=${to}`),
      ])

      if (metaRes.ok) {
        const meta = await metaRes.json()
        const rows = meta.data || []
        setMetaLeads(rows.reduce((s: number, r: { leads: number }) => s + r.leads, 0))
        setMetaSpend(rows.reduce((s: number, r: { spend: number }) => s + r.spend, 0))
      }

      if (ghlRes.ok) {
        const ghl = await ghlRes.json()
        setCommercialActions(ghl.commercial_actions || null)
        setCallStats(ghl.call_stats || null)

        const stages = (ghl.data || []) as PipelineStage[]
        setPipelineStages(stages)
        setTotalNewContacts(stages.reduce((s, st) => s + (st.new_contacts || 0), 0))
      }
    } catch (err) {
      console.error('Error fetching metrics:', err)
    } finally {
      setLoading(false)
    }
  }, [getEffectiveRange])

  useEffect(() => { fetchData() }, [fetchData])

  const ca = commercialActions

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Metricas</h1>
          <p className="text-muted-foreground">Rendimiento comercial y marketing</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            {(['7', '30'] as const).map(d => (
              <button
                key={d}
                onClick={() => setRange(d)}
                className={`px-3 py-1.5 text-sm transition-colors ${range === d ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                {d}d
              </button>
            ))}
            <button
              onClick={() => setRange('custom')}
              className={`px-3 py-1.5 text-sm transition-colors ${range === 'custom' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              Custom
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {range === 'custom' && (
        <div className="flex items-center gap-2">
          <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-40" />
          <span className="text-muted-foreground">—</span>
          <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-40" />
          <Button size="sm" onClick={fetchData}>Aplicar</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Acciones Comerciales */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Acciones Comerciales
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Tasaciones Solicitadas</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">{ca?.tasaciones_solicitadas ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Tasaciones Coordinadas</p>
                  <p className="text-3xl font-bold text-amber-600 mt-1">{ca?.tasaciones_coordinadas ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Tasaciones Realizadas</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">{ca?.tasaciones_realizadas ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Captaciones</p>
                  <p className="text-3xl font-bold text-purple-600 mt-1">{ca?.captaciones ?? 0}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Pipeline y Leads */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Embudo Comercial
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Leads Meta</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">{metaLeads}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Nuevos en Pipeline</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">{totalNewContacts}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Gasto Meta Ads</p>
                  <p className="text-3xl font-bold text-amber-600 mt-1">
                    ${metaSpend.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Llamadas</p>
                  <p className="text-3xl font-bold text-purple-600 mt-1">{callStats?.total_calls ?? 0}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Resumen del Pipeline Interno */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Resumen Interno
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Tasaciones por Embudo</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{ca?.tasaciones_solicitadas ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Conversion Tasacion → Captacion</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    {(ca?.tasaciones_realizadas ?? 0) > 0
                      ? `${Math.round(((ca?.captaciones ?? 0) / (ca?.tasaciones_realizadas ?? 1)) * 100)}%`
                      : '—'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase text-muted-foreground">CPL promedio</p>
                  <p className="text-2xl font-bold text-amber-600 mt-1">
                    {metaLeads > 0 ? `$${Math.round(metaSpend / metaLeads).toLocaleString('es-AR')}` : '—'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
