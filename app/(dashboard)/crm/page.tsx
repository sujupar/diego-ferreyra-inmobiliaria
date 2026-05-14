'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { DataTable, Column } from '@/components/ui/DataTable'
import { BulkActionsBar } from '@/components/ui/BulkActionsBar'
import {
  Loader2, RefreshCw, ChevronRight, User, MapPin, Calendar,
  LayoutList, Table2, SlidersHorizontal,
  CalendarPlus, CalendarCheck, CalendarX, Eye,
  Send, MessageSquare, Home, XCircle, Clock, GraduationCap,
  CheckSquare, Square, Trash2, ShoppingCart, Users
} from 'lucide-react'

// ── CRM Stage Configuration ─────────────────────────────────────
interface CRMStage {
  key: string
  label: string
  icon: typeof User
  gradient: string
  badgeBg: string
  badgeText: string
  ringColor: string
  dotColor: string
}

const CRM_STAGES: CRMStage[] = [
  {
    key: 'clase_gratuita', label: 'Clase Gratuita',
    icon: GraduationCap,
    gradient: 'from-cyan-50 to-cyan-100/60 dark:from-cyan-950/40 dark:to-cyan-900/20',
    badgeBg: 'bg-cyan-100 dark:bg-cyan-900/50', badgeText: 'text-cyan-700 dark:text-cyan-300',
    ringColor: 'ring-cyan-400', dotColor: 'bg-cyan-500',
  },
  {
    key: 'solicitud', label: 'Solicitud',
    icon: CalendarPlus,
    gradient: 'from-sky-50 to-sky-100/60 dark:from-sky-950/40 dark:to-sky-900/20',
    badgeBg: 'bg-sky-100 dark:bg-sky-900/50', badgeText: 'text-sky-700 dark:text-sky-300',
    ringColor: 'ring-sky-400', dotColor: 'bg-sky-500',
  },
  {
    key: 'coordinada', label: 'Coordinada',
    icon: CalendarCheck,
    gradient: 'from-blue-50 to-blue-100/60 dark:from-blue-950/40 dark:to-blue-900/20',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/50', badgeText: 'text-blue-700 dark:text-blue-300',
    ringColor: 'ring-blue-400', dotColor: 'bg-blue-500',
  },
  {
    key: 'no_realizada', label: 'No Realizada',
    icon: CalendarX,
    gradient: 'from-rose-50 to-rose-100/60 dark:from-rose-950/40 dark:to-rose-900/20',
    badgeBg: 'bg-rose-100 dark:bg-rose-900/50', badgeText: 'text-rose-700 dark:text-rose-300',
    ringColor: 'ring-rose-400', dotColor: 'bg-rose-500',
  },
  {
    key: 'realizada', label: 'Realizada',
    icon: Eye,
    gradient: 'from-amber-50 to-amber-100/60 dark:from-amber-950/40 dark:to-amber-900/20',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/50', badgeText: 'text-amber-700 dark:text-amber-300',
    ringColor: 'ring-amber-400', dotColor: 'bg-amber-500',
  },
  {
    key: 'entregada', label: 'Entregada',
    icon: Send,
    gradient: 'from-purple-50 to-purple-100/60 dark:from-purple-950/40 dark:to-purple-900/20',
    badgeBg: 'bg-purple-100 dark:bg-purple-900/50', badgeText: 'text-purple-700 dark:text-purple-300',
    ringColor: 'ring-purple-400', dotColor: 'bg-purple-500',
  },
  {
    key: 'seguimiento', label: 'Seguimiento',
    icon: MessageSquare,
    gradient: 'from-orange-50 to-orange-100/60 dark:from-orange-950/40 dark:to-orange-900/20',
    badgeBg: 'bg-orange-100 dark:bg-orange-900/50', badgeText: 'text-orange-700 dark:text-orange-300',
    ringColor: 'ring-orange-400', dotColor: 'bg-orange-500',
  },
  {
    key: 'captada', label: 'Captada',
    icon: Home,
    gradient: 'from-emerald-50 to-emerald-100/60 dark:from-emerald-950/40 dark:to-emerald-900/20',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/50', badgeText: 'text-emerald-700 dark:text-emerald-300',
    ringColor: 'ring-emerald-400', dotColor: 'bg-emerald-500',
  },
  {
    key: 'descartado', label: 'Descartado',
    icon: XCircle,
    gradient: 'from-red-50 to-red-100/60 dark:from-red-950/40 dark:to-red-900/20',
    badgeBg: 'bg-red-100 dark:bg-red-900/50', badgeText: 'text-red-700 dark:text-red-300',
    ringColor: 'ring-red-400', dotColor: 'bg-red-500',
  },
  {
    key: 'comprador', label: 'Comprador',
    icon: ShoppingCart,
    gradient: 'from-teal-50 to-teal-100/60 dark:from-teal-950/40 dark:to-teal-900/20',
    badgeBg: 'bg-teal-100 dark:bg-teal-900/50', badgeText: 'text-teal-700 dark:text-teal-300',
    ringColor: 'ring-teal-400', dotColor: 'bg-teal-500',
  },
]

function deriveCRMStage(deal: Deal): string {
  switch (deal.stage) {
    case 'clase_gratuita': return 'clase_gratuita'
    case 'request': return 'solicitud'
    // Compat: deals viejos con stage='scheduled' sin scheduled_date son
    // "Solicitudes" pre-migración. La migración 20260506000001 ya los
    // backfilleó, pero mantenemos el fallback por defensa.
    case 'scheduled': return deal.scheduled_date ? 'coordinada' : 'solicitud'
    case 'not_visited': return 'no_realizada'
    case 'visited': return 'realizada'
    case 'appraisal_sent': return 'entregada'
    case 'followup': return 'seguimiento'
    case 'captured': return 'captada'
    case 'lost': return 'descartado'
    case 'comprador': return 'comprador'
    default: return 'solicitud'
  }
}

function getCRMStageInfo(key: string): CRMStage {
  return CRM_STAGES.find(s => s.key === key) || CRM_STAGES[0]
}

// Map raw deals.stage → CRM stage key for server-side aggregated counts.
// Approximate: server doesn't distinguish solicitud vs coordinada (by scheduled_date).
// Acceptable for MVP.
function mapStageToCRM(stage: string): string {
  switch (stage) {
    case 'clase_gratuita': return 'clase_gratuita'
    case 'request': return 'solicitud'
    case 'scheduled': return 'coordinada'
    case 'not_visited': return 'no_realizada'
    case 'visited': return 'realizada'
    case 'appraisal_sent': return 'entregada'
    case 'followup': return 'seguimiento'
    case 'captured': return 'captada'
    case 'lost': return 'descartado'
    case 'comprador': return 'comprador'
    default: return 'solicitud'
  }
}

const PAGE_SIZE = 50

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
  tags?: string[] | null
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `hace ${days}d`
}

// ── Component ────────────────────────────────────────────────────
export default function CRMPage() {
  const router = useRouter()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCRMStage, setFilterCRMStage] = useState('')
  const [filterOrigin, setFilterOrigin] = useState('')
  const [filterAdvisor, setFilterAdvisor] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards')
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
  const [advisors, setAdvisors] = useState<Array<{ id: string; full_name: string }>>([])
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [serverStageCounts, setServerStageCounts] = useState<Record<string, number>>({})
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActioning, setBulkActioning] = useState(false)
  const [showColegas, setShowColegas] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUserInfo).catch(() => {})
    fetch('/api/users/advisors').then(r => r.ok ? r.json() : { data: [] }).then(j => setAdvisors(j.data || [])).catch(() => {})
  }, [])

  // Abogados don't belong in CRM — they work from /properties/review
  useEffect(() => {
    if (userInfo?.role === 'abogado') {
      router.replace('/properties/review')
    }
  }, [userInfo, router])

  const fetchData = useCallback(async (opts?: { append?: boolean; pageOverride?: number }) => {
    const append = opts?.append === true
    const targetPage = opts?.pageOverride ?? (append ? page : 0)
    if (append) setLoadingMore(true)
    else setLoading(true)

    const params = new URLSearchParams()
    if (filterOrigin) params.set('origin', filterOrigin)
    if (dateRange.from) params.set('from', dateRange.from)
    if (dateRange.to) params.set('to', dateRange.to)
    if (userInfo?.role === 'asesor') {
      params.set('assigned_to', userInfo.id)
    } else if (filterAdvisor) {
      params.set('assigned_to', filterAdvisor)
    }
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(targetPage * PAGE_SIZE))

    try {
      const res = await fetch(`/api/deals?${params}`)
      if (res.ok) {
        const { data, total: t, stageCounts: sc } = await res.json()
        if (append) setDeals(prev => [...prev, ...(data || [])])
        else setDeals(data || [])
        setTotal(t ?? 0)
        setServerStageCounts(sc || {})
        setPage(targetPage)
      }
    } catch (err) {
      console.error('CRM fetch error:', err)
    } finally {
      if (append) setLoadingMore(false)
      else setLoading(false)
    }
  }, [filterOrigin, filterAdvisor, dateRange, userInfo, page])

  // Reset page to 0 whenever filters change (fetchData w/ append=false starts at page 0)
  useEffect(() => {
    if (userInfo) fetchData({ append: false, pageOverride: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOrigin, filterAdvisor, dateRange, userInfo])

  const canHardDelete = userInfo?.role === 'admin' || userInfo?.role === 'dueno'

  function toggleSelectMode() {
    setSelectMode(prev => {
      if (prev) setSelectedIds(new Set())
      return !prev
    })
  }

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const confirmation = prompt(
      `Vas a ELIMINAR DEFINITIVAMENTE ${ids.length} proceso${ids.length !== 1 ? 's' : ''} comercial${ids.length !== 1 ? 'es' : ''}.\n\n` +
      `Esta acción no se puede deshacer. Las tasaciones, propiedades y contactos asociados quedan intactos — solo desaparece el proceso del CRM.\n\n` +
      `Para confirmar, escribí ELIMINAR:`
    )
    if (confirmation !== 'ELIMINAR') return
    setBulkActioning(true)
    const results = await Promise.allSettled(
      ids.map(id => fetch(`/api/deals/${id}`, { method: 'DELETE' }))
    )
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
    setBulkActioning(false)
    setSelectedIds(new Set())
    setSelectMode(false)
    await fetchData({ append: false, pageOverride: 0 })
    if (failed > 0) alert(`${failed} no se pudieron eliminar. Probablemente requieren permisos de admin/dueño.`)
  }

  const dealsWithCRM = deals.map(d => ({ ...d, crmStage: deriveCRMStage(d) }))

  // Asesor role: hide stages pre-asignación (clase_gratuita, solicitud).
  // Esos los maneja exclusivamente el coordinador antes de asignar asesor.
  const PRE_ASSIGNMENT_STAGES = ['clase_gratuita', 'solicitud']
  const roleFilteredDeals = userInfo?.role === 'asesor'
    ? dealsWithCRM.filter(d => !PRE_ASSIGNMENT_STAGES.includes(d.crmStage))
    : dealsWithCRM

  // Por defecto ocultamos deals tag='colega' (vienen importados de GHL).
  // Se ven con el toggle "Mostrar colegas".
  const colegaFilteredDeals = showColegas
    ? roleFilteredDeals
    : roleFilteredDeals.filter(d => !(d.tags || []).includes('colega'))

  const filteredDeals = filterCRMStage
    ? colegaFilteredDeals.filter(d => d.crmStage === filterCRMStage)
    : colegaFilteredDeals

  const colegaCount = roleFilteredDeals.filter(d => (d.tags || []).includes('colega')).length

  // Server-provided stageCounts (all pages, not just loaded slice).
  const stageCounts: Record<string, number> = {}
  for (const [rawStage, n] of Object.entries(serverStageCounts)) {
    const k = mapStageToCRM(rawStage)
    stageCounts[k] = (stageCounts[k] || 0) + (n as number)
  }
  // For asesor: zero out pre-asignación stages
  if (userInfo?.role === 'asesor') {
    for (const k of PRE_ASSIGNMENT_STAGES) stageCounts[k] = 0
  }

  // For asesor we approximate by using the loaded-slice filtered count (since we
  // can't distinguish solicitud vs coordinada server-side).
  const totalDealsDisplay = userInfo?.role === 'asesor' ? roleFilteredDeals.length : total
  const isGlobal = userInfo && ['dueno', 'admin', 'coordinador'].includes(userInfo.role)

  const columns: Column<(typeof dealsWithCRM)[0]>[] = [
    { key: 'contact_name', label: 'Contacto', sortable: true, render: r => (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{r.contact_name.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <span className="font-medium text-sm">{r.contact_name}</span>
          {r.contact_phone && <span className="block text-xs text-muted-foreground">{r.contact_phone}</span>}
        </div>
      </div>
    )},
    { key: 'property_address', label: 'Propiedad', sortable: true, render: r => (
      <span className="text-muted-foreground text-sm truncate max-w-[220px] block">{r.property_address}</span>
    )},
    { key: 'crmStage', label: 'Etapa', sortable: true, render: r => {
      const s = getCRMStageInfo(r.crmStage)
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.badgeBg} ${s.badgeText}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dotColor}`} />
          {s.label}
        </span>
      )
    }},
    { key: 'origin', label: 'Origen', sortable: true, render: r => r.origin ? <Badge variant="secondary" className="text-xs font-normal">{ORIGIN_LABELS[r.origin] || r.origin}</Badge> : <span className="text-muted-foreground text-xs">—</span> },
    ...(isGlobal ? [{ key: 'assigned_to_name' as const, label: 'Asesor', sortable: true, render: (r: (typeof dealsWithCRM)[0]) => <span className="text-sm text-muted-foreground">{r.assigned_to_name || '—'}</span> }] : []),
    { key: 'stage_changed_at', label: 'Actualizado', sortable: true, render: r => (
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" />
        <span className="tabular-n">{timeAgo(r.stage_changed_at)}</span>
      </span>
    )},
  ]

  const activeStageInfo = filterCRMStage ? getCRMStageInfo(filterCRMStage) : null

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="eyebrow">Dashboard · Procesos</p>
          <h1 className="display text-4xl">CRM</h1>
          <p className="text-muted-foreground text-sm">
            <span className="tabular-n">{totalDealsDisplay}</span> proceso{totalDealsDisplay !== 1 ? 's' : ''} comercial{totalDealsDisplay !== 1 ? 'es' : ''}
            {filterCRMStage && (
              <span className={`ml-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${activeStageInfo?.badgeBg} ${activeStageInfo?.badgeText}`}>
                {activeStageInfo?.label}
                <button onClick={() => setFilterCRMStage('')} className="ml-0.5 hover:opacity-70">&times;</button>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
            >
              <Table2 className="h-4 w-4" />
            </button>
          </div>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1.5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
          </Button>
          {canHardDelete && (
            <Button
              variant={selectMode ? 'default' : 'outline'}
              size="sm"
              onClick={toggleSelectMode}
              className="gap-1.5"
            >
              {selectMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {selectMode ? 'Cancelar' : 'Seleccionar'}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchData({ append: false, pageOverride: 0 })}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Bulk actions bar — visible cuando hay selección */}
      {selectMode && (
        <BulkActionsBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          noun="procesos"
          actions={[
            { label: 'Eliminar', icon: <Trash2 className="h-4 w-4 mr-1" />, variant: 'destructive', onClick: handleBulkDelete, disabled: bulkActioning },
          ]}
        />
      )}

      {/* ── Stage Pipeline ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
        {CRM_STAGES
          .filter(s => !(userInfo?.role === 'asesor' && s.key === 'solicitud'))
          .map((s) => {
          const count = stageCounts[s.key] || 0
          const isActive = filterCRMStage === s.key
          const Icon = s.icon
          return (
            <button
              key={s.key}
              onClick={() => setFilterCRMStage(isActive ? '' : s.key)}
              className={`
                group relative rounded-xl border p-3 text-left transition-all duration-200
                bg-gradient-to-br ${s.gradient}
                ${isActive
                  ? `ring-2 ${s.ringColor} shadow-lg scale-[1.02]`
                  : 'hover:shadow-md hover:scale-[1.01] border-transparent'
                }
              `}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${s.badgeBg}`}>
                  <Icon className={`h-3.5 w-3.5 ${s.badgeText}`} />
                </div>
                {count > 0 && (
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dotColor}`} />
                )}
              </div>
              <p className="eyebrow truncate">{s.label}</p>
              <p className="display text-3xl tabular-nums mt-1">{count}</p>
            </button>
          )
        })}
      </div>

      {/* ── Filters Bar ─────────────────────────────────────── */}
      <div className="space-y-3">
        <DateRangeFilter onChange={setDateRange} />

        {showFilters && (
          <div className="flex gap-4 flex-wrap items-center p-4 bg-muted/30 rounded-xl border border-border/50">
            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-xs font-medium text-muted-foreground mr-1">Origen</span>
              <Button variant={filterOrigin === '' ? 'default' : 'outline'} size="sm" className="h-7 text-xs rounded-full" onClick={() => setFilterOrigin('')}>Todos</Button>
              {Object.entries(ORIGIN_LABELS).map(([key, label]) => (
                <Button key={key} variant={filterOrigin === key ? 'default' : 'outline'} size="sm" className="h-7 text-xs rounded-full" onClick={() => setFilterOrigin(key)}>{label}</Button>
              ))}
            </div>

            {isGlobal && advisors.length > 0 && (
              <div className="flex gap-1.5 items-center">
                <span className="text-xs font-medium text-muted-foreground mr-1">Asesor</span>
                <select
                  value={filterAdvisor}
                  onChange={e => setFilterAdvisor(e.target.value)}
                  className="h-7 text-xs rounded-full border border-input bg-background px-3 pr-6 appearance-none"
                >
                  <option value="">Todos</option>
                  {advisors.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </div>
            )}

            {colegaCount > 0 && (
              <div className="flex gap-1.5 items-center">
                <span className="text-xs font-medium text-muted-foreground mr-1">Colegas</span>
                <Button
                  variant={showColegas ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs rounded-full gap-1.5"
                  onClick={() => setShowColegas(prev => !prev)}
                >
                  <Users className="h-3 w-3" />
                  {showColegas ? `Ocultar (${colegaCount})` : `Mostrar (${colegaCount})`}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Cargando procesos...</p>
        </div>
      ) : filteredDeals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            <User className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <div className="text-center">
            <h3 className="font-semibold mb-1">Sin procesos</h3>
            <p className="text-sm text-muted-foreground max-w-xs">No hay procesos que coincidan con los filtros seleccionados.</p>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <DataTable
          data={filteredDeals}
          columns={columns}
          getRowKey={r => r.id}
          onRowClick={selectMode ? undefined : r => router.push(`/pipeline/${r.id}`)}
          selectable={selectMode}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      ) : (
        <div className="space-y-2">
          {filteredDeals.map((deal, idx) => {
            const stageInfo = getCRMStageInfo(deal.crmStage)
            const Icon = stageInfo.icon
            const isSelected = selectedIds.has(deal.id)
            const rowInner = (
              <div className={`group flex items-center gap-4 p-4 rounded-xl border bg-card transition-all duration-200 cursor-pointer hover:shadow-sm ${isSelected ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20' : 'hover:bg-muted/30'}`}>
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(deal.id)}
                      onClick={e => e.stopPropagation()}
                      className="h-4 w-4 rounded border-input cursor-pointer shrink-0"
                      aria-label="Seleccionar proceso"
                    />
                  )}
                  {/* Number prefix */}
                  <span className="number-prefix text-lg leading-none w-7 text-right shrink-0 tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </span>

                  {/* Avatar */}
                  <div className="h-11 w-11 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      {deal.contact_name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm">{deal.contact_name}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${stageInfo.badgeBg} ${stageInfo.badgeText}`}>
                        <Icon className="h-3 w-3" />
                        {stageInfo.label}
                      </span>
                      {deal.origin && (
                        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{ORIGIN_LABELS[deal.origin] || deal.origin}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1 truncate max-w-[250px]">
                        <MapPin className="h-3 w-3 shrink-0" />{deal.property_address}
                      </span>
                      {deal.scheduled_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /><span className="tabular-n">{formatDate(deal.scheduled_date)}</span>
                        </span>
                      )}
                      {isGlobal && deal.assigned_to_name && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />{deal.assigned_to_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="tabular-n text-[11px] text-muted-foreground hidden sm:block">{timeAgo(deal.stage_changed_at)}</span>
                    {!selectMode && <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />}
                  </div>
                </div>
            )
            return selectMode ? (
              <div key={deal.id} onClick={() => toggleSelection(deal.id)} role="button" tabIndex={0}>
                {rowInner}
              </div>
            ) : (
              <Link key={deal.id} href={`/pipeline/${deal.id}`}>
                {rowInner}
              </Link>
            )
          })}
        </div>
      )}

      {/* Cargar más — only when there are more records on the server */}
      {!loading && deals.length < total && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => fetchData({ append: true, pageOverride: page + 1 })}
          >
            {loadingMore ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Cargando…</>
            ) : (
              <>Cargar más ({deals.length} / {total})</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
