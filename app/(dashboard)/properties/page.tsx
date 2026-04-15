'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Building2, Plus, MapPin, Calendar, Loader2, ChevronRight, LayoutList, Table2 } from 'lucide-react'

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-400' },
  pending_docs: { label: 'Pend. Docs', color: 'bg-amber-500' },
  pending_photos: { label: 'Pend. Fotos', color: 'bg-orange-500' },
  pending_review: { label: 'En Revision', color: 'bg-purple-500' },
  approved: { label: 'Aprobada', color: 'bg-green-500' },
  rejected: { label: 'Rechazada', color: 'bg-red-500' },
  active: { label: 'Activa', color: 'bg-emerald-600' },
}

interface Property {
  id: string; address: string; neighborhood: string; city: string; property_type: string
  asking_price: number; currency: string; status: string; origin: string | null
  photos: string[]; created_at: string; legal_status?: string
}

function getPropertyStatusInfo(p: Property) {
  if (p.status === 'pending_review' && p.legal_status === 'approved') {
    return { label: 'Pend. Fotos', color: 'bg-amber-500' }
  }
  return STATUS_INFO[p.status] || { label: p.status, color: 'bg-gray-400' }
}

function formatCurrency(v: number, c: string = 'USD') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: c === 'ARS' ? 'ARS' : 'USD', minimumFractionDigits: 0 }).format(v)
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function PropertiesPage() {
  const router = useRouter()
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'table'>('table')
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUserInfo).catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (dateRange.from) params.set('from', dateRange.from)
    if (dateRange.to) params.set('to', dateRange.to)
    if (userInfo?.role === 'asesor') params.set('assigned_to', userInfo.id)

    setLoading(true)
    fetch(`/api/properties?${params}`)
      .then(r => r.json())
      .then(({ data }) => setProperties(data || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [filterStatus, dateRange, userInfo])

  const columns: Column<Property>[] = [
    { key: 'address', label: 'Direccion', sortable: true, render: r => <span className="font-medium">{r.address}</span> },
    { key: 'neighborhood', label: 'Barrio', sortable: true, render: r => <span className="text-muted-foreground">{r.neighborhood}</span> },
    { key: 'property_type', label: 'Tipo', sortable: true, render: r => <span className="capitalize">{r.property_type}</span> },
    { key: 'asking_price', label: 'Precio', sortable: true, className: 'text-right', render: r => <span className="font-medium">{formatCurrency(r.asking_price, r.currency)}</span> },
    { key: 'status', label: 'Estado', sortable: true, render: r => { const s = getPropertyStatusInfo(r); return <Badge className={`text-xs text-white ${s.color}`}>{s.label}</Badge> } },
    { key: 'origin', label: 'Origen', sortable: true, render: r => r.origin ? <Badge variant="secondary" className="text-xs capitalize">{r.origin}</Badge> : <span>—</span> },
    { key: 'created_at', label: 'Fecha', sortable: true, render: r => <span className="text-sm text-muted-foreground">{formatDate(r.created_at)}</span> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Propiedades</h1>
          <p className="text-muted-foreground">{properties.length} propiedad{properties.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><LayoutList className="h-4 w-4" /></button>
            <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><Table2 className="h-4 w-4" /></button>
          </div>
          <Link href="/properties/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva</Button></Link>
        </div>
      </div>

      <DateRangeFilter onChange={setDateRange} />

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        <Button variant={filterStatus === '' ? 'default' : 'outline'} size="sm" onClick={() => setFilterStatus('')}>Todas</Button>
        {Object.entries(STATUS_INFO).map(([key, info]) => (
          <Button key={key} variant={filterStatus === key ? 'default' : 'outline'} size="sm" onClick={() => setFilterStatus(key)}>{info.label}</Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Sin propiedades</h3>
            <p className="text-sm text-muted-foreground mb-4">Crea tu primera propiedad captada.</p>
            <Link href="/properties/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva</Button></Link>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <DataTable data={properties} columns={columns} getRowKey={r => r.id} onRowClick={r => router.push(`/properties/${r.id}`)} />
      ) : (
        <div className="space-y-3">
          {properties.map(prop => {
            const statusInfo = getPropertyStatusInfo(prop)
            return (
              <Link key={prop.id} href={`/properties/${prop.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-4">
                    {prop.photos?.[0] ? (
                      <img src={prop.photos[0]} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center"><Building2 className="h-6 w-6 text-muted-foreground" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{prop.address}</span>
                        <Badge className={`text-xs text-white ${statusInfo.color}`}>{statusInfo.label}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{prop.neighborhood}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(prop.created_at)}</span>
                      </div>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(prop.asking_price, prop.currency)}</span>
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
