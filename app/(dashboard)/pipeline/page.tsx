'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { DataTable, Column } from '@/components/ui/DataTable'
import {
  Loader2, RefreshCw, Plus, ChevronRight, User, MapPin, Calendar,
  LayoutList, Table2, Phone
} from 'lucide-react'

const STAGES = [
  { key: '', label: 'Todas' },
  { key: 'scheduled', label: 'Agendadas', color: 'bg-blue-500' },
  { key: 'visited', label: 'Visitadas', color: 'bg-amber-500' },
  { key: 'appraisal_sent', label: 'Entregadas', color: 'bg-purple-500' },
  { key: 'followup', label: 'Seguimiento', color: 'bg-orange-500' },
  { key: 'captured', label: 'Captadas', color: 'bg-green-500' },
  { key: 'lost', label: 'Perdidas', color: 'bg-red-500' },
]

const ORIGIN_LABELS: Record<string, string> = { embudo: 'Embudo', referido: 'Referido', historico: 'Historico' }

interface Deal {
  id: string
  stage: string
  property_address: string
  scheduled_date: string | null
  origin: string | null
  assigned_to_name: string
  contact_name: string
  contact_phone: string
  contact_email: string
  appraisal_id: string | null
  property_id: string | null
  stage_changed_at: string
  created_at: string
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getStageInfo(stage: string) {
  return STAGES.find(s => s.key === stage) || { key: stage, label: stage, color: 'bg-gray-400' }
}

export default function PipelinePage() {
  const router = useRouter()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStage, setFilterStage] = useState('')
  const [filterOrigin, setFilterOrigin] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'table'>('table')
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUserInfo).catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStage) params.set('stage', filterStage)
    if (filterOrigin) params.set('origin', filterOrigin)
    if (dateRange.from) params.set('from', dateRange.from)
    if (dateRange.to) params.set('to', dateRange.to)
    if (userInfo?.role === 'asesor') params.set('assigned_to', userInfo.id)

    try {
      const res = await fetch(`/api/deals?${params}`)
      if (res.ok) {
        const { data } = await res.json()
        setDeals(data || [])
      }
    } catch (err) {
      console.error('Pipeline fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [filterStage, filterOrigin, dateRange, userInfo])

  useEffect(() => { fetchData() }, [fetchData])

  // Stage counts
  const stageCounts = deals.reduce((acc, d) => {
    acc[d.stage] = (acc[d.stage] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const columns: Column<Deal>[] = [
    { key: 'contact_name', label: 'Contacto', sortable: true, render: r => (
      <div>
        <span className="font-medium">{r.contact_name}</span>
        {r.contact_phone && <span className="block text-xs text-muted-foreground">{r.contact_phone}</span>}
      </div>
    )},
    { key: 'property_address', label: 'Dirección', sortable: true, render: r => <span className="text-muted-foreground truncate max-w-[200px] block">{r.property_address}</span> },
    { key: 'stage', label: 'Etapa', sortable: true, render: r => {
      const s = getStageInfo(r.stage)
      return <Badge className={`text-xs text-white ${s.color}`}>{s.label}</Badge>
    }},
    { key: 'origin', label: 'Origen', sortable: true, render: r => r.origin ? <Badge variant="secondary" className="text-xs">{ORIGIN_LABELS[r.origin] || r.origin}</Badge> : <span>—</span> },
    { key: 'assigned_to_name', label: 'Asesor', sortable: true, render: r => <span className="text-sm">{r.assigned_to_name || '—'}</span> },
    { key: 'scheduled_date', label: 'Fecha', sortable: true, render: r => <span className="text-sm text-muted-foreground">{r.scheduled_date ? formatDate(r.scheduled_date) : formatDate(r.created_at)}</span> },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground">{deals.length} proceso{deals.length !== 1 ? 's' : ''} comercial{deals.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-md border">
            <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><LayoutList className="h-4 w-4" /></button>
            <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><Table2 className="h-4 w-4" /></button>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          <Link href="/pipeline/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Agendar</Button></Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {STAGES.filter(s => s.key).map(s => (
          <Card key={s.key} className={`cursor-pointer transition-all ${filterStage === s.key ? 'ring-2 ring-primary' : 'hover:shadow-md'}`} onClick={() => setFilterStage(filterStage === s.key ? '' : s.key)}>
            <CardContent className="py-3 px-4 text-center">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold mt-0.5">{stageCounts[s.key] || 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <DateRangeFilter onChange={setDateRange} />

      <div className="flex gap-2 flex-wrap">
        <Button variant={filterOrigin === '' ? 'default' : 'outline'} size="sm" onClick={() => setFilterOrigin('')}>Todas</Button>
        {Object.entries(ORIGIN_LABELS).map(([key, label]) => (
          <Button key={key} variant={filterOrigin === key ? 'default' : 'outline'} size="sm" onClick={() => setFilterOrigin(key)}>{label}</Button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : deals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Sin procesos</h3>
            <p className="text-sm text-muted-foreground mb-4">Agenda tu primera tasación para iniciar un proceso comercial.</p>
            <Link href="/pipeline/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Agendar Tasación</Button></Link>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <DataTable data={deals} columns={columns} getRowKey={r => r.id} onRowClick={r => router.push(`/pipeline/${r.id}`)} />
      ) : (
        <div className="space-y-2">
          {deals.map(deal => {
            const stageInfo = getStageInfo(deal.stage)
            return (
              <Link key={deal.id} href={`/pipeline/${deal.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{deal.contact_name}</span>
                        <Badge className={`text-xs text-white ${stageInfo.color}`}>{stageInfo.label}</Badge>
                        {deal.origin && <Badge variant="secondary" className="text-xs">{ORIGIN_LABELS[deal.origin] || deal.origin}</Badge>}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{deal.property_address}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(deal.created_at)}</span>
                        {deal.assigned_to_name && <span>{deal.assigned_to_name}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
