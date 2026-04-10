'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { DataTable, Column } from '@/components/ui/DataTable'
import {
  Loader2, RefreshCw, Plus, Home, FileCheck, ClipboardList,
  Calendar, MapPin, User, ChevronRight, LayoutList, Table2
} from 'lucide-react'

interface PipelineItem {
  id: string
  type: 'appraisal' | 'property'
  title: string
  location: string
  status: string
  origin: string | null
  assigned_to_name: string | null
  created_at: string
  price: number | null
  currency: string | null
}

const APPRAISAL_STAGES = [
  { key: 'all', label: 'Todas', color: 'bg-gray-500' },
  { key: 'pending', label: 'Solicitadas', color: 'bg-blue-500' },
  { key: 'scheduled', label: 'Agendadas', color: 'bg-amber-500' },
  { key: 'completed', label: 'Realizadas', color: 'bg-green-500' },
]

const PROPERTY_STAGES = [
  { key: 'draft', label: 'Borrador', color: 'bg-gray-400' },
  { key: 'pending_docs', label: 'Pend. Docs', color: 'bg-amber-400' },
  { key: 'pending_photos', label: 'Pend. Fotos', color: 'bg-orange-400' },
  { key: 'pending_review', label: 'Pend. Revision', color: 'bg-purple-400' },
  { key: 'approved', label: 'Aprobada', color: 'bg-green-500' },
  { key: 'active', label: 'Activa', color: 'bg-emerald-600' },
]

const ORIGIN_LABELS: Record<string, string> = {
  embudo: 'Embudo',
  referido: 'Referido',
  historico: 'Historico',
  tasacion: 'Tasacion',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(v: number, c: string = 'USD') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: c === 'ARS' ? 'ARS' : 'USD', minimumFractionDigits: 0 }).format(v)
}

export default function PipelinePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [appraisals, setAppraisals] = useState<PipelineItem[]>([])
  const [properties, setProperties] = useState<PipelineItem[]>([])
  const [activeTab, setActiveTab] = useState<'tasaciones' | 'propiedades'>('tasaciones')
  const [filterOrigin, setFilterOrigin] = useState<string>('')
  const [viewMode, setViewMode] = useState<'list' | 'table'>('table')
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      let url = '/api/pipeline'
      const params = new URLSearchParams()
      if (dateRange.from) params.set('from', dateRange.from)
      if (dateRange.to) params.set('to', dateRange.to)
      if (params.toString()) url += '?' + params.toString()

      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setAppraisals(data.appraisals || [])
        setProperties(data.properties || [])
      }
    } catch (err) {
      console.error('Pipeline fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const appraisalColumns: Column<PipelineItem>[] = [
    { key: 'title', label: 'Propiedad', sortable: true, render: r => <span className="font-medium">{r.title}</span> },
    { key: 'location', label: 'Ubicacion', sortable: true, render: r => <span className="text-muted-foreground">{r.location}</span> },
    { key: 'origin', label: 'Origen', sortable: true, render: r => r.origin ? <Badge variant="secondary" className="text-xs capitalize">{ORIGIN_LABELS[r.origin] || r.origin}</Badge> : <span className="text-muted-foreground">—</span> },
    { key: 'assigned_to_name', label: 'Asesor', sortable: true, render: r => <span className="text-sm">{r.assigned_to_name || '—'}</span> },
    { key: 'created_at', label: 'Fecha', sortable: true, render: r => <span className="text-sm text-muted-foreground">{formatDate(r.created_at)}</span> },
    { key: 'price', label: 'Precio', sortable: true, className: 'text-right', render: r => r.price ? <span className="font-medium">{formatCurrency(r.price, r.currency || 'USD')}</span> : <span>—</span> },
  ]

  const propertyColumns: Column<PipelineItem>[] = [
    { key: 'title', label: 'Direccion', sortable: true, render: r => <span className="font-medium">{r.title}</span> },
    { key: 'location', label: 'Barrio', sortable: true, render: r => <span className="text-muted-foreground">{r.location}</span> },
    { key: 'status', label: 'Estado', sortable: true, render: r => { const s = PROPERTY_STAGES.find(s => s.key === r.status); return s ? <Badge className={`text-xs text-white ${s.color}`}>{s.label}</Badge> : <span>{r.status}</span> } },
    { key: 'origin', label: 'Origen', sortable: true, render: r => r.origin ? <Badge variant="secondary" className="text-xs capitalize">{ORIGIN_LABELS[r.origin] || r.origin}</Badge> : <span>—</span> },
    { key: 'created_at', label: 'Fecha', sortable: true, render: r => <span className="text-sm text-muted-foreground">{formatDate(r.created_at)}</span> },
    { key: 'price', label: 'Precio', sortable: true, className: 'text-right', render: r => r.price ? <span className="font-medium">{formatCurrency(r.price, r.currency || 'USD')}</span> : <span>—</span> },
  ]

  const filteredAppraisals = filterOrigin
    ? appraisals.filter(a => a.origin === filterOrigin)
    : appraisals

  const filteredProperties = filterOrigin
    ? properties.filter(p => p.origin === filterOrigin)
    : properties

  // Count by origin
  const originCounts = appraisals.reduce((acc, a) => {
    const o = a.origin || 'sin_origen'
    acc[o] = (acc[o] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const propertyCounts = properties.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground">Gestion de tasaciones y propiedades captadas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/pipeline/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Agendar Tasacion
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPI Summary */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-medium uppercase text-muted-foreground">Total Tasaciones</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{appraisals.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-medium uppercase text-muted-foreground">Por Embudo</p>
                <p className="text-3xl font-bold text-purple-600 mt-1">{originCounts['embudo'] || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-medium uppercase text-muted-foreground">Referidos</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{originCounts['referido'] || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-medium uppercase text-muted-foreground">Propiedades Captadas</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{(propertyCounts['approved'] || 0) + (propertyCounts['active'] || 0)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setActiveTab('tasaciones')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'tasaciones' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <FileCheck className="h-4 w-4 inline mr-1" />
              Tasaciones ({appraisals.length})
            </button>
            <button
              onClick={() => setActiveTab('propiedades')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'propiedades' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Home className="h-4 w-4 inline mr-1" />
              Propiedades ({properties.length})
            </button>
          </div>

          {/* Date Range Filter */}
          <DateRangeFilter onChange={range => { setDateRange(range); }} />

          {/* Origin Filter + View Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <Button variant={filterOrigin === '' ? 'default' : 'outline'} size="sm" onClick={() => setFilterOrigin('')}>
                Todas
              </Button>
              {['embudo', 'referido', 'historico'].map(o => (
                <Button key={o} variant={filterOrigin === o ? 'default' : 'outline'} size="sm" onClick={() => setFilterOrigin(o)}>
                  {ORIGIN_LABELS[o]}
                </Button>
              ))}
            </div>
            <div className="flex rounded-md border">
              <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><LayoutList className="h-4 w-4" /></button>
              <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><Table2 className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Content */}
          {activeTab === 'tasaciones' && viewMode === 'table' && filteredAppraisals.length > 0 && (
            <DataTable
              data={filteredAppraisals}
              columns={appraisalColumns}
              getRowKey={r => r.id}
              onRowClick={r => router.push(`/appraisals/${r.id}`)}
            />
          )}

          {activeTab === 'tasaciones' && viewMode === 'list' && (
            <div className="space-y-3">
              {filteredAppraisals.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-1">Sin tasaciones</h3>
                    <p className="text-sm text-muted-foreground mb-4">Crea tu primera tasacion para verla aqui.</p>
                    <Link href="/appraisal/new">
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva Tasacion</Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                filteredAppraisals.map(item => (
                  <Link key={item.id} href={`/appraisals/${item.id}`}>
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                      <CardContent className="flex items-center gap-4 py-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium truncate">{item.title || 'Sin titulo'}</span>
                            {item.origin && (
                              <Badge variant="secondary" className="text-xs">{ORIGIN_LABELS[item.origin] || item.origin}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span>
                            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(item.created_at)}</span>
                            {item.assigned_to_name && (
                              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{item.assigned_to_name}</span>
                            )}
                          </div>
                        </div>
                        {item.price && (
                          <span className="text-sm font-medium">{formatCurrency(item.price, item.currency || 'USD')}</span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          )}

          {activeTab === 'tasaciones' && filteredAppraisals.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">Sin tasaciones</h3>
                <p className="text-sm text-muted-foreground mb-4">Crea tu primera tasacion para verla aqui.</p>
                <Link href="/appraisal/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva Tasacion</Button></Link>
              </CardContent>
            </Card>
          )}

          {activeTab === 'propiedades' && viewMode === 'table' && filteredProperties.length > 0 && (
            <DataTable
              data={filteredProperties}
              columns={propertyColumns}
              getRowKey={r => r.id}
              onRowClick={r => router.push(`/properties/${r.id}`)}
            />
          )}

          {activeTab === 'propiedades' && viewMode === 'list' && (
            <div className="space-y-3">
              {filteredProperties.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <Home className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-1">Sin propiedades</h3>
                    <p className="text-sm text-muted-foreground mb-4">Las propiedades captadas apareceran aqui.</p>
                    <Link href="/properties/new">
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva Propiedad</Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                filteredProperties.map(item => (
                  <Link key={item.id} href={`/properties/${item.id}`}>
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                      <CardContent className="flex items-center gap-4 py-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium truncate">{item.title}</span>
                            {item.origin && (
                              <Badge variant="secondary" className="text-xs">{ORIGIN_LABELS[item.origin] || item.origin}</Badge>
                            )}
                            {PROPERTY_STAGES.find(s => s.key === item.status) && (
                              <Badge className={`text-xs text-white ${PROPERTY_STAGES.find(s => s.key === item.status)?.color}`}>
                                {PROPERTY_STAGES.find(s => s.key === item.status)?.label}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span>
                            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(item.created_at)}</span>
                          </div>
                        </div>
                        {item.price && (
                          <span className="text-sm font-medium">{formatCurrency(item.price, item.currency || 'USD')}</span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
