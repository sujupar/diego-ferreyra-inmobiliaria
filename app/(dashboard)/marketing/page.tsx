'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw, Send, TrendingUp, DollarSign, MousePointerClick, Users, Loader2, Phone } from 'lucide-react'

interface MetaRow {
  date: string
  campaign_id: string
  campaign_name: string | null
  impressions: number
  clicks: number
  ctr: number
  spend: number
  leads: number
  cost_per_lead: number | null
}

interface PipelineRow {
  date: string
  pipeline_id: string
  pipeline_name: string | null
  stage_id: string
  stage_name: string | null
  contact_count: number
  opportunity_value: number
}

interface CallStats {
  total_calls: number
  answered_calls: number
  missed_calls: number
  total_duration_seconds: number
  average_duration_seconds: number
}

interface ReportLogRow {
  id: string
  report_type: string
  sent_at: string
  recipients: string[]
  subject: string | null
  status: string
  error_message: string | null
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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

export default function MarketingPage() {
  const [range, setRange] = useState<'7' | '30' | 'custom'>('7')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [metaData, setMetaData] = useState<MetaRow[]>([])
  const [pipelineData, setPipelineData] = useState<PipelineRow[]>([])
  const [callStats, setCallStats] = useState<CallStats | null>(null)
  const [reportLog, setReportLog] = useState<ReportLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sendingReport, setSendingReport] = useState(false)

  const getEffectiveRange = useCallback(() => {
    if (range === 'custom' && customFrom && customTo) {
      return { from: customFrom, to: customTo }
    }
    return getDateRange(range === '30' ? 30 : 7)
  }, [range, customFrom, customTo])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { from, to } = getEffectiveRange()

    try {
      const [metaRes, ghlRes, logRes] = await Promise.all([
        fetch(`/api/marketing/meta?from=${from}&to=${to}`),
        fetch(`/api/marketing/ghl?from=${from}&to=${to}`),
        fetch('/api/marketing/reports/history?limit=5'),
      ])

      if (metaRes.ok) {
        const meta = await metaRes.json()
        setMetaData(meta.data || [])
      }
      if (ghlRes.ok) {
        const ghl = await ghlRes.json()
        setPipelineData(ghl.data || [])
        setCallStats(ghl.call_stats || null)
      }
      if (logRes.ok) {
        const log = await logRes.json()
        setReportLog(log.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch marketing data:', err)
    } finally {
      setLoading(false)
    }
  }, [getEffectiveRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleRefresh() {
    setRefreshing(true)
    const { from, to } = getEffectiveRange()

    try {
      await Promise.all([
        fetch('/api/marketing/meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to }),
        }),
        fetch('/api/marketing/ghl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to }),
        }),
      ])
      await fetchData()
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setRefreshing(false)
    }
  }

  async function handleSendTestReport() {
    setSendingReport(true)
    try {
      const res = await fetch('/api/marketing/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'daily' }),
      })
      const result = await res.json()
      if (result.success) {
        alert('Reporte enviado exitosamente')
        await fetchData()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch {
      alert('Error al enviar el reporte')
    } finally {
      setSendingReport(false)
    }
  }

  // Aggregate Meta data
  const metaTotals = metaData.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      spend: acc.spend + row.spend,
      leads: acc.leads + row.leads,
    }),
    { impressions: 0, clicks: 0, spend: 0, leads: 0 }
  )
  const averageCtr = metaTotals.impressions > 0 ? (metaTotals.clicks / metaTotals.impressions) * 100 : 0
  const averageCpl = metaTotals.leads > 0 ? metaTotals.spend / metaTotals.leads : null

  // Aggregate campaigns (group by campaign_id)
  const campaignMap = new Map<string, MetaRow>()
  for (const row of metaData) {
    const existing = campaignMap.get(row.campaign_id)
    if (existing) {
      existing.impressions += row.impressions
      existing.clicks += row.clicks
      existing.spend += row.spend
      existing.leads += row.leads
    } else {
      campaignMap.set(row.campaign_id, { ...row })
    }
  }
  const campaigns = Array.from(campaignMap.values())

  // Aggregate pipeline data (latest per stage)
  const pipelineMap = new Map<string, { name: string; stages: Map<string, PipelineRow> }>()
  for (const row of pipelineData) {
    if (!pipelineMap.has(row.pipeline_id)) {
      pipelineMap.set(row.pipeline_id, { name: row.pipeline_name || '', stages: new Map() })
    }
    const pipeline = pipelineMap.get(row.pipeline_id)!
    const existing = pipeline.stages.get(row.stage_id)
    if (!existing || row.date > existing.date) {
      pipeline.stages.set(row.stage_id, row)
    }
  }

  const totalPipelineContacts = Array.from(pipelineMap.values()).reduce(
    (sum, p) => sum + Array.from(p.stages.values()).reduce((s, st) => s + st.contact_count, 0),
    0
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Marketing Analytics</h1>
          <p className="text-sm text-muted-foreground">Meta Ads + GoHighLevel CRM</p>
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
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Custom date range */}
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
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">{metaTotals.leads}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Costo por Lead</CardTitle>
                <DollarSign className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {averageCpl !== null ? formatCurrency(averageCpl) : '—'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gasto Total</CardTitle>
                <DollarSign className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">{formatCurrency(metaTotals.spend)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pipeline CRM</CardTitle>
                <Users className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">{totalPipelineContacts}</div>
              </CardContent>
            </Card>
          </div>

          {/* Meta Ads Campaigns Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MousePointerClick className="h-5 w-5" />
                Meta Ads — Campanas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {campaigns.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium text-muted-foreground">Campana</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Impresiones</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Clicks</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">CTR</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Leads</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Gasto</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">CPL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map(c => {
                        const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0
                        const cpl = c.leads > 0 ? c.spend / c.leads : null
                        return (
                          <tr key={c.campaign_id} className="border-b last:border-0">
                            <td className="py-2">{c.campaign_name || c.campaign_id}</td>
                            <td className="py-2 text-right">{c.impressions.toLocaleString('es-AR')}</td>
                            <td className="py-2 text-right">{c.clicks.toLocaleString('es-AR')}</td>
                            <td className="py-2 text-right">{ctr.toFixed(2)}%</td>
                            <td className="py-2 text-right font-medium">{c.leads}</td>
                            <td className="py-2 text-right">{formatCurrency(c.spend)}</td>
                            <td className="py-2 text-right">{cpl !== null ? formatCurrency(cpl) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No hay datos de campanas para este periodo.</p>
              )}
            </CardContent>
          </Card>

          {/* GHL Pipeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Pipeline CRM (GoHighLevel)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pipelineMap.size > 0 ? (
                <div className="space-y-6">
                  {Array.from(pipelineMap.entries()).map(([pipelineId, pipeline]) => {
                    const stages = Array.from(pipeline.stages.values())
                    const totalContacts = stages.reduce((s, st) => s + st.contact_count, 0)
                    const totalValue = stages.reduce((s, st) => s + st.opportunity_value, 0)

                    return (
                      <div key={pipelineId}>
                        <h3 className="mb-3 text-base font-semibold">{pipeline.name}</h3>

                        {/* Visual funnel bars */}
                        <div className="mb-4 space-y-2">
                          {stages.map(stage => {
                            const pct = totalContacts > 0 ? (stage.contact_count / totalContacts) * 100 : 0
                            return (
                              <div key={stage.stage_id} className="flex items-center gap-3">
                                <span className="w-32 truncate text-sm text-muted-foreground">{stage.stage_name}</span>
                                <div className="flex-1">
                                  <div className="h-6 rounded bg-muted">
                                    <div
                                      className="flex h-6 items-center rounded bg-purple-500 px-2 text-xs font-medium text-white transition-all"
                                      style={{ width: `${Math.max(pct, 8)}%` }}
                                    >
                                      {stage.contact_count}
                                    </div>
                                  </div>
                                </div>
                                <span className="w-24 text-right text-sm text-muted-foreground">
                                  {formatCurrency(stage.opportunity_value)}
                                </span>
                              </div>
                            )
                          })}
                        </div>

                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span>Total contactos: <strong className="text-foreground">{totalContacts}</strong></span>
                          <span>Valor total: <strong className="text-foreground">{formatCurrency(totalValue)}</strong></span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No hay datos de pipeline para este periodo.</p>
              )}
            </CardContent>
          </Card>

          {/* Call Stats */}
          {callStats && callStats.total_calls > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Llamadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div className="rounded-lg bg-blue-50 p-4 text-center dark:bg-blue-950">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Total</p>
                    <p className="mt-1 text-3xl font-bold text-blue-600">{callStats.total_calls}</p>
                  </div>
                  <div className="rounded-lg bg-green-50 p-4 text-center dark:bg-green-950">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Contestadas</p>
                    <p className="mt-1 text-3xl font-bold text-green-600">{callStats.answered_calls}</p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-4 text-center dark:bg-red-950">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Perdidas</p>
                    <p className="mt-1 text-3xl font-bold text-red-600">{callStats.missed_calls}</p>
                  </div>
                  <div className="rounded-lg bg-purple-50 p-4 text-center dark:bg-purple-950">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Duracion Prom.</p>
                    <p className="mt-1 text-3xl font-bold text-purple-600">
                      {callStats.average_duration_seconds > 0
                        ? `${Math.floor(callStats.average_duration_seconds / 60)}m ${callStats.average_duration_seconds % 60}s`
                        : '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Report Log + Send Test */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Reportes Enviados
              </CardTitle>
              <Button size="sm" onClick={handleSendTestReport} disabled={sendingReport}>
                {sendingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar reporte de prueba
              </Button>
            </CardHeader>
            <CardContent>
              {reportLog.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium text-muted-foreground">Tipo</th>
                        <th className="pb-2 font-medium text-muted-foreground">Fecha</th>
                        <th className="pb-2 font-medium text-muted-foreground">Asunto</th>
                        <th className="pb-2 font-medium text-muted-foreground">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportLog.map(log => (
                        <tr key={log.id} className="border-b last:border-0">
                          <td className="py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              log.report_type === 'daily' ? 'bg-blue-100 text-blue-700' :
                              log.report_type === 'weekly' ? 'bg-green-100 text-green-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {log.report_type === 'daily' ? 'Diario' : log.report_type === 'weekly' ? 'Semanal' : 'Mensual'}
                            </span>
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {new Date(log.sent_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="max-w-xs truncate py-2">{log.subject || '—'}</td>
                          <td className="py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              log.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {log.status === 'sent' ? 'Enviado' : 'Error'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No se han enviado reportes aun.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
