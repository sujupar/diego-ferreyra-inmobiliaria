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
  Loader2, RefreshCw, ChevronRight, User, MapPin, Calendar,
  LayoutList, Table2, Phone, Filter
} from 'lucide-react'

// ── CRM Stages: derived from deal data ──────────────────────────
interface CRMStage {
  key: string
  label: string
  color: string
  badgeColor: string
}

const CRM_STAGES: CRMStage[] = [
  { key: 'solicitud', label: 'Solicitud', color: 'bg-sky-500', badgeColor: 'bg-sky-500 text-white' },
  { key: 'coordinada', label: 'Coordinada', color: 'bg-blue-500', badgeColor: 'bg-blue-500 text-white' },
  { key: 'no_realizada', label: 'No Realizada', color: 'bg-rose-400', badgeColor: 'bg-rose-400 text-white' },
  { key: 'visitada', label: 'Visitada', color: 'bg-amber-500', badgeColor: 'bg-amber-500 text-white' },
  { key: 'tasacion_creada', label: 'Tasación Creada', color: 'bg-indigo-500', badgeColor: 'bg-indigo-500 text-white' },
  { key: 'entregada', label: 'Entregada', color: 'bg-purple-500', badgeColor: 'bg-purple-500 text-white' },
  { key: 'seguimiento', label: 'Seguimiento', color: 'bg-orange-500', badgeColor: 'bg-orange-500 text-white' },
  { key: 'captada', label: 'Captada', color: 'bg-green-500', badgeColor: 'bg-green-500 text-white' },
  { key: 'descartado', label: 'Descartado', color: 'bg-red-500', badgeColor: 'bg-red-500 text-white' },
]

function deriveCRMStage(deal: Deal): string {
  switch (deal.stage) {
    case 'scheduled':
      return deal.scheduled_date ? 'coordinada' : 'solicitud'
    case 'not_visited':
      return 'no_realizada'
    case 'visited':
      return deal.appraisal_id ? 'tasacion_creada' : 'visitada'
    case 'appraisal_sent':
      return 'entregada'
    case 'followup':
      return 'seguimiento'
    case 'captured':
      return 'captada'
    case 'lost':
      return 'descartado'
    default:
      return 'solicitud'
  }
}

function getCRMStageInfo(key: string): CRMStage {
  return CRM_STAGES.find(s => s.key === key) || CRM_STAGES[0]
}

const ORIGIN_LABELS: Record<string, string> = { embudo: 'Embudo', referido: 'Referido', historico: 'Historico' }

// ── Types ────────────────────────────────────────────────────────
interface Deal {
  id: string
  stage: string
  property_address: string
  scheduled_date: string | null
  origin: string | null
  assigned_to: string | null
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

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Component ────────────────────────────────────────────────────
export default function CRMPage() {
  const router = useRouter()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCRMStage, setFilterCRMStage] = useState('')
  const [filterOrigin, setFilterOrigin] = useState('')
  const [filterAdvisor, setFilterAdvisor] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
  const [advisors, setAdvisors] = useState<Array<{ id: string; full_name: string }>>([])
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUserInfo).catch(() => {})
    fetch('/api/users/advisors').then(r => r.ok ? r.json() : { data: [] }).then(j => setAdvisors(j.data || [])).catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterOrigin) params.set('origin', filterOrigin)
    if (dateRange.from) params.set('from', dateRange.from)
    if (dateRange.to) params.set('to', dateRange.to)

    // Role-based filtering
    if (userInfo?.role === 'asesor') {
      params.set('assigned_to', userInfo.id)
    } else if (filterAdvisor) {
      params.set('assigned_to', filterAdvisor)
    }

    try {
      const res = await fetch(`/api/deals?${params}`)
      if (res.ok) {
        const { data } = await res.json()
        setDeals(data || [])
      }
    } catch (err) {
      console.error('CRM fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [filterOrigin, filterAdvisor, dateRange, userInfo])

  useEffect(() => { if (userInfo) fetchData() }, [fetchData, userInfo])

  // Derive CRM stages and filter
  const dealsWithCRM = deals.map(d => ({ ...d, crmStage: deriveCRMStage(d) }))
  const filteredDeals = filterCRMStage
    ? dealsWithCRM.filter(d => d.crmStage === filterCRMStage)
    : dealsWithCRM

  // KPI counts (always from full dataset, not filtered by stage)
  const stageCounts = dealsWithCRM.reduce((acc, d) => {
    acc[d.crmStage] = (acc[d.crmStage] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const isGlobal = userInfo && ['dueno', 'admin', 'coordinador'].includes(userInfo.role)

  const columns: Column<(typeof dealsWithCRM)[0]>[] = [
    { key: 'contact_name', label: 'Contacto', sortable: true, render: r => (
      <div>
        <span className="font-medium">{r.contact_name}</span>
        {r.contact_phone && <span className="block text-xs text-muted-foreground">{r.contact_phone}</span>}
      </div>
    )},
    { key: 'property_address', label: 'Dirección', sortable: true, render: r => <span className="text-muted-foreground truncate max-w-[200px] block">{r.property_address}</span> },
    { key: 'crmStage', label: 'Etapa', sortable: true, render: r => {
      const s = getCRMStageInfo(r.crmStage)
      return <Badge className={`text-xs ${s.badgeColor}`}>{s.label}</Badge>
    }},
    { key: 'origin', label: 'Origen', sortable: true, render: r => r.origin ? <Badge variant="secondary" className="text-xs">{ORIGIN_LABELS[r.origin] || r.origin}</Badge> : <span className="text-muted-foreground">—</span> },
    ...(isGlobal ? [{ key: 'assigned_to_name' as const, label: 'Asesor', sortable: true, render: (r: (typeof dealsWithCRM)[0]) => <span className="text-sm">{r.assigned_to_name || '—'}</span> }] : []),
    { key: 'scheduled_date', label: 'Agendada', sortable: true, render: r => <span className="text-sm text-muted-foreground">{r.scheduled_date ? formatDate(r.scheduled_date) : '—'}</span> },
    { key: 'stage_changed_at', label: 'Actualización', sortable: true, render: r => <span className="text-xs text-muted-foreground">{formatDateTime(r.stage_changed_at)}</span> },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM</h1>
          <p className="text-muted-foreground">
            {filteredDeals.length} proceso{filteredDeals.length !== 1 ? 's' : ''}
            {filterCRMStage && ` · ${getCRMStageInfo(filterCRMStage).label}`}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-md border">
            <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'} rounded-l-md`}><Table2 className="h-4 w-4" /></button>
            <button onClick={() => setViewMode('cards')} className={`p-2 ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'} rounded-r-md`}><LayoutList className="h-4 w-4" /></button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-1" /> Filtros
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* KPI Stage Cards */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {CRM_STAGES.map(s => {
          const count = stageCounts[s.key] || 0
          const isActive = filterCRMStage === s.key
          return (
            <Card
              key={s.key}
              className={`cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary shadow-md' : 'hover:shadow-md'}`}
              onClick={() => setFilterCRMStage(isActive ? '' : s.key)}
            >
              <CardContent className="py-2 px-3 text-center">
                <p className="text-[10px] text-muted-foreground leading-tight truncate">{s.label}</p>
                <p className="text-xl font-bold mt-0.5">{count}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Date Filter */}
      <DateRangeFilter onChange={setDateRange} />

      {/* Additional Filters */}
      {showFilters && (
        <div className="flex gap-3 flex-wrap items-center p-3 bg-muted/50 rounded-lg">
          {/* Origin filter */}
          <div className="flex gap-1 flex-wrap">
            <span className="text-xs text-muted-foreground self-center mr-1">Origen:</span>
            <Button variant={filterOrigin === '' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setFilterOrigin('')}>Todos</Button>
            {Object.entries(ORIGIN_LABELS).map(([key, label]) => (
              <Button key={key} variant={filterOrigin === key ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setFilterOrigin(key)}>{label}</Button>
            ))}
          </div>

          {/* Advisor filter (only for global roles) */}
          {isGlobal && advisors.length > 0 && (
            <div className="flex gap-1 items-center">
              <span className="text-xs text-muted-foreground mr-1">Asesor:</span>
              <select
                value={filterAdvisor}
                onChange={e => setFilterAdvisor(e.target.value)}
                className="h-7 text-xs rounded-md border border-input bg-background px-2"
              >
                <option value="">Todos</option>
                {advisors.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filteredDeals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Sin procesos</h3>
            <p className="text-sm text-muted-foreground">No hay procesos que coincidan con los filtros seleccionados.</p>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <DataTable
          data={filteredDeals}
          columns={columns}
          getRowKey={r => r.id}
          onRowClick={r => router.push(`/pipeline/${r.id}`)}
        />
      ) : (
        <div className="space-y-2">
          {filteredDeals.map(deal => {
            const stageInfo = getCRMStageInfo(deal.crmStage)
            return (
              <Link key={deal.id} href={`/pipeline/${deal.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium">{deal.contact_name}</span>
                        <Badge className={`text-xs ${stageInfo.badgeColor}`}>{stageInfo.label}</Badge>
                        {deal.origin && <Badge variant="secondary" className="text-xs">{ORIGIN_LABELS[deal.origin] || deal.origin}</Badge>}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" />{deal.property_address}</span>
                        {deal.scheduled_date && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(deal.scheduled_date)}</span>}
                        {isGlobal && deal.assigned_to_name && <span className="text-xs">{deal.assigned_to_name}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
