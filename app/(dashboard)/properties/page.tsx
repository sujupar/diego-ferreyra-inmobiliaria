'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { DataTable, Column } from '@/components/ui/DataTable'
import { BulkActionsBar } from '@/components/ui/BulkActionsBar'
import { Building2, Plus, MapPin, Calendar, Loader2, ChevronRight, LayoutList, LayoutGrid, Table2, Archive, Trash2 } from 'lucide-react'
import { PropertyCard } from './_components/PropertyCard'
import { PropertyDetailModal, type DetailProperty } from './_components/PropertyDetailModal'
import { ScheduleVisitDialog } from './_components/ScheduleVisitDialog'

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-400' },
  pending_docs: { label: 'Pend. Docs', color: 'bg-amber-500' },
  pending_photos: { label: 'Pend. Fotos', color: 'bg-orange-500' },
  pending_review: { label: 'En Revision', color: 'bg-purple-500' },
  approved: { label: 'Aprobada', color: 'bg-green-500' },
  rejected: { label: 'Rechazada', color: 'bg-red-500' },
  active: { label: 'Activa', color: 'bg-emerald-600' },
  descartada: { label: 'Descartada', color: 'bg-slate-500' },
}

// Shape del LISTADO — viene de vw_properties_list (GET /api/properties), sin
// el array `photos` completo (A3 de la auditoría: 21.951 KB por request, 99%
// eran fotos base64 legacy). Solo `thumbnail` (portada) + `photo_count`.
// El detalle completo (galería, descripción, video, tour) se pide aparte al
// abrir el modal — ver fetchFullProperty más abajo.
interface Property {
  id: string; address: string; neighborhood: string; city: string; property_type: string
  asking_price: number; currency: string; status: string; origin: string | null
  thumbnail: string | null; photo_count: number; thumbnail_is_legacy_base64: boolean
  created_at: string; legal_status?: string
  assigned_to?: string | null; rooms?: number | null; bathrooms?: number | null; covered_area?: number | null
  legal_docs_pending?: boolean | null; origin_pending?: boolean | null
}

const PAGE_SIZE = 24

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
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'table'>('grid')
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActioning, setBulkActioning] = useState(false)
  const [onlyMine, setOnlyMine] = useState(false)
  const [modalProperty, setModalProperty] = useState<DetailProperty | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [scheduleVisitOpen, setScheduleVisitOpen] = useState(false)
  const [scheduleForPropertyId, setScheduleForPropertyId] = useState<string | null>(null)
  // Orden de la vista tabla (hallazgo #7): se resuelve en el SERVIDOR, no en
  // memoria sobre la página cargada — ver `buildParams`/`getPropertiesListPage`.
  const [tableSort, setTableSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const canHardDelete = userInfo?.role === 'admin' || userInfo?.role === 'dueno'
  // Hallazgo #11 (carrera al abrir dos fichas seguidas): guarda el id
  // efectivamente pedido; si la respuesta llega y ya no coincide con el
  // último pedido, se descarta — no pisa el modal de una ficha más nueva.
  const modalRequestIdRef = useRef<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('propertiesViewMode') as 'grid' | 'list' | 'table' | null
    if (saved === 'grid' || saved === 'list' || saved === 'table') setViewMode(saved)
  }, [])
  useEffect(() => {
    localStorage.setItem('propertiesViewMode', viewMode)
  }, [viewMode])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUserInfo).catch(() => {})
  }, [])

  function buildParams(offset: number, limit: number = PAGE_SIZE) {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (dateRange.from) params.set('from', dateRange.from)
    if (dateRange.to) params.set('to', dateRange.to)
    if (onlyMine && userInfo?.id) params.set('assigned_to', userInfo.id)
    if (tableSort) {
      params.set('sort', tableSort.key)
      params.set('dir', tableSort.dir)
    }
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    return params
  }

  // Paginado de a PAGE_SIZE (24) — ver task-7-brief.md. Reset a la página 0
  // cada vez que cambia un filtro (u orden — mismo criterio: ambos cambian
  // QUÉ 24 filas corresponden a la página 0).
  useEffect(() => {
    setLoading(true)
    fetch(`/api/properties?${buildParams(0)}`)
      .then(r => r.json())
      .then(({ data, total, hasMore }) => {
        setProperties(data || [])
        setTotal(total ?? (data || []).length)
        setHasMore(!!hasMore)
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
    // Limpiar selección al cambiar filtros
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, dateRange, userInfo, onlyMine, tableSort])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/properties?${buildParams(properties.length)}`)
      const { data, total: newTotal, hasMore: newHasMore } = await res.json()
      setProperties(prev => [...prev, ...(data || [])])
      setTotal(newTotal ?? 0)
      setHasMore(!!newHasMore)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingMore(false)
    }
  }

  // Hallazgo #9: una acción en lote (descartar/eliminar) recargaba con
  // offset=0 y el limit de UNA página, así que un asesor que había cargado 3
  // páginas volvía a ver solo 24 filas — perdía su lugar en el scroll. Ahora
  // re-pide TANTAS filas como había cargadas (mínimo una página), para que el
  // listado visible no encoja por debajo de lo que el asesor ya había traído.
  async function refreshProperties() {
    const keep = Math.max(properties.length, PAGE_SIZE)
    const res = await fetch(`/api/properties?${buildParams(0, keep)}`)
    const { data, total: newTotal, hasMore: newHasMore } = await res.json()
    setProperties(data || [])
    setTotal(newTotal ?? (data || []).length)
    setHasMore(!!newHasMore)
  }

  // El listado no trae galería/descripción/video/tour (esos campos NUNCA
  // viajan en vw_properties_list) — al abrir el modal se pide el detalle
  // completo por GET /api/properties/[id] (mismo endpoint que usa la ficha).
  async function openPropertyModal(p: Property) {
    // Hallazgo #11: si se abre la ficha A y, antes de que responda el detalle
    // completo, se abre la ficha B, la respuesta tardía de A no debe pisar el
    // modal de B. `modalRequestIdRef` guarda el ÚLTIMO id pedido; cualquier
    // respuesta que llegue para un id distinto se descarta.
    modalRequestIdRef.current = p.id
    setModalProperty({
      id: p.id,
      address: p.address,
      neighborhood: p.neighborhood,
      city: p.city,
      property_type: p.property_type,
      asking_price: p.asking_price,
      currency: p.currency,
      status: p.status,
      photos: p.thumbnail && !p.thumbnail_is_legacy_base64 ? [p.thumbnail] : [],
      rooms: p.rooms,
      bathrooms: p.bathrooms,
      covered_area: p.covered_area,
      assigned_to: p.assigned_to,
    })
    setModalOpen(true)
    setModalLoading(true)
    try {
      const res = await fetch(`/api/properties/${p.id}`)
      const { data } = await res.json()
      if (data && modalRequestIdRef.current === p.id) setModalProperty(data)
    } catch (err) {
      console.error(err)
    } finally {
      if (modalRequestIdRef.current === p.id) setModalLoading(false)
    }
  }

  async function handleBulkDiscard() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!confirm(`¿Descartar ${ids.length} propiedad${ids.length !== 1 ? 'es' : ''}?\n\nQuedan guardadas en el sistema con status="Descartada" y se pueden restaurar.`)) return
    setBulkActioning(true)
    const results = await Promise.allSettled(
      ids.map(id => fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'descartada' }),
      }))
    )
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
    setBulkActioning(false)
    setSelectedIds(new Set())
    await refreshProperties()
    if (failed > 0) alert(`${failed} no se pudieron descartar. Revisá la consola.`)
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const confirmation = prompt(
      `Vas a ELIMINAR DEFINITIVAMENTE ${ids.length} propiedad${ids.length !== 1 ? 'es' : ''}.\n\n` +
      `Esta acción no se puede deshacer. Se borran publicaciones, métricas, fotos y eventos legales asociados.\n\n` +
      `Para confirmar, escribí ELIMINAR:`
    )
    if (confirmation !== 'ELIMINAR') return
    setBulkActioning(true)
    const results = await Promise.allSettled(
      ids.map(id => fetch(`/api/properties/${id}`, { method: 'DELETE' }))
    )
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
    setBulkActioning(false)
    setSelectedIds(new Set())
    await refreshProperties()
    if (failed > 0) alert(`${failed} no se pudieron eliminar. Probablemente requieren permisos de admin/dueño.`)
  }

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
          <p className="text-muted-foreground">
            {properties.length < total ? `${properties.length} de ${total}` : total} propiedad{total !== 1 ? 'es' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button size="sm" variant={viewMode === 'grid' ? 'default' : 'outline'} onClick={() => setViewMode('grid')} title="Vista grid">
              <LayoutGrid className="size-4" />
            </Button>
            <Button size="sm" variant={viewMode === 'list' ? 'default' : 'outline'} onClick={() => setViewMode('list')} title="Vista lista">
              <LayoutList className="size-4" />
            </Button>
            <Button size="sm" variant={viewMode === 'table' ? 'default' : 'outline'} onClick={() => setViewMode('table')} title="Vista tabla">
              <Table2 className="size-4" />
            </Button>
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
        <Button
          size="sm"
          variant={onlyMine ? 'default' : 'outline'}
          onClick={() => setOnlyMine(!onlyMine)}
        >
          {onlyMine ? '✓ Solo mías' : 'Solo mías'}
        </Button>
      </div>

      <BulkActionsBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        noun="propiedades"
        actions={[
          { label: 'Descartar', icon: <Archive className="h-4 w-4 mr-1" />, onClick: handleBulkDiscard, disabled: bulkActioning },
          ...(canHardDelete ? [{ label: 'Eliminar', icon: <Trash2 className="h-4 w-4 mr-1" />, variant: 'destructive' as const, onClick: handleBulkDelete, disabled: bulkActioning }] : []),
        ]}
      />

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
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {properties.map(p => (
            <PropertyCard
              key={p.id}
              property={p}
              currentUserId={userInfo?.id}
              statusInfo={getPropertyStatusInfo(p)}
              onClick={() => openPropertyModal(p)}
            />
          ))}
        </div>
      ) : viewMode === 'table' ? (
        <DataTable
          data={properties}
          columns={columns}
          getRowKey={r => r.id}
          onRowClick={r => router.push(`/properties/${r.id}`)}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          // Orden CONTROLADO (server-side, hallazgo #7): `properties` es una
          // página parcial (24 de N), así que ordenarla en memoria acá
          // ordenaría solo lo cargado. `tableSort` dispara un refetch page-0.
          sort={tableSort}
          onSortChange={(key, dir) => setTableSort({ key, dir })}
        />
      ) : (
        <div className="space-y-3">
          {properties.map(prop => {
            const statusInfo = getPropertyStatusInfo(prop)
            return (
              <Link key={prop.id} href={`/properties/${prop.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-4">
                    {prop.thumbnail ? (
                      <img src={prop.thumbnail} alt="" className="h-14 w-14 rounded-lg object-cover" />
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

      {!loading && hasMore && (
        <div className="flex justify-center py-4">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Cargar más ({properties.length} de {total})
          </Button>
        </div>
      )}

      <PropertyDetailModal
        property={modalProperty}
        open={modalOpen}
        loading={modalLoading}
        onOpenChange={setModalOpen}
        currentUserId={userInfo?.id}
        onScheduleVisit={(id) => {
          setScheduleForPropertyId(id)
          setScheduleVisitOpen(true)
          setModalOpen(false)
        }}
      />

      <ScheduleVisitDialog
        propertyId={scheduleForPropertyId}
        propertyAddress={properties.find(p => p.id === scheduleForPropertyId)?.address}
        open={scheduleVisitOpen}
        onOpenChange={setScheduleVisitOpen}
      />
    </div>
  )
}
