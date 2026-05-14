'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  Mail,
  Phone,
  Building2,
  ExternalLink,
  CheckCircle2,
  Clock,
  Calendar,
  XCircle,
  Filter,
} from 'lucide-react'
import { LeadDetailSheet } from './LeadDetailSheet'

interface LeadRow {
  id: string
  property_id: string
  name: string
  email: string | null
  phone: string | null
  message: string | null
  source: string
  status: string
  assigned_to: string | null
  notes: string | null
  created_at: string
  properties: {
    address: string
    title: string | null
    neighborhood: string | null
    assigned_to: string | null
  } | null
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'new', label: 'Nuevos' },
  { value: 'contacted', label: 'Contactados' },
  { value: 'scheduled', label: 'Agendados' },
  { value: 'discarded', label: 'Descartados' },
] as const

const SOURCE_LABELS: Record<string, string> = {
  landing: 'Landing',
  meta_form: 'Meta Ads',
  portal_mercadolibre: 'MercadoLibre',
  portal_argenprop: 'Argenprop',
  portal_zonaprop: 'ZonaProp',
}

function statusBadge(status: string) {
  switch (status) {
    case 'new':
      return { icon: Mail, color: 'bg-blue-500 text-white', label: 'Nuevo' }
    case 'contacted':
      return { icon: Clock, color: 'bg-amber-500 text-white', label: 'Contactado' }
    case 'scheduled':
      return { icon: Calendar, color: 'bg-emerald-600 text-white', label: 'Agendado' }
    case 'discarded':
      return { icon: XCircle, color: 'bg-gray-400 text-white', label: 'Descartado' }
    default:
      return { icon: CheckCircle2, color: 'bg-gray-400 text-white', label: status }
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'recién'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d} día${d > 1 ? 's' : ''}`
  return new Date(iso).toLocaleDateString('es-AR')
}

export function InboxClient({ userRole, userId }: { userRole: string; userId: string }) {
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeStatus, setActiveStatus] = useState<string>('new')
  const [activeSource, setActiveSource] = useState<string>('')
  const [days, setDays] = useState(30)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ days: String(days), limit: '200' })
      if (activeStatus) params.set('status', activeStatus)
      if (activeSource) params.set('source', activeSource)
      const res = await fetch(`/api/leads?${params.toString()}`)
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: 'Error' }))
        throw new Error(msg || 'Error al cargar leads')
      }
      const { data } = await res.json()
      setLeads(data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setLeads([])
    } finally {
      setLoading(false)
    }
  }, [activeStatus, activeSource, days])

  useEffect(() => {
    load()
    // refresca cada 60s
    const handle = setInterval(load, 60000)
    return () => clearInterval(handle)
  }, [load])

  const filtered = useMemo(() => {
    if (!leads) return []
    if (!search.trim()) return leads
    const q = search.toLowerCase()
    return leads.filter(
      l =>
        l.name.toLowerCase().includes(q) ||
        (l.email ?? '').toLowerCase().includes(q) ||
        (l.phone ?? '').toLowerCase().includes(q) ||
        (l.properties?.address ?? '').toLowerCase().includes(q) ||
        (l.message ?? '').toLowerCase().includes(q),
    )
  }, [leads, search])

  const counts = useMemo(() => {
    const c = { all: 0, new: 0, contacted: 0, scheduled: 0, discarded: 0 }
    for (const l of leads ?? []) {
      c.all++
      if (l.status in c) (c as Record<string, number>)[l.status]++
    }
    return c
  }, [leads])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <p className="eyebrow">Pipeline comercial</p>
        <h1 className="display text-3xl">Inbox de leads</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {userRole === 'asesor'
            ? 'Leads de tus propiedades.'
            : 'Todos los leads del equipo.'}
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Estado:</span>
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setActiveStatus(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  activeStatus === opt.value
                    ? 'bg-[color:var(--brand)] text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-sm">
            <span className="font-medium">Fuente:</span>
            <select
              value={activeSource}
              onChange={e => setActiveSource(e.target.value)}
              className="border rounded px-2 py-1 bg-background"
            >
              <option value="">Todas</option>
              <option value="landing">Landing</option>
              <option value="meta_form">Meta Ads</option>
              <option value="portal_mercadolibre">MercadoLibre</option>
              <option value="portal_argenprop">Argenprop</option>
              <option value="portal_zonaprop">ZonaProp</option>
            </select>

            <span className="font-medium ml-3">Período:</span>
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="border rounded px-2 py-1 bg-background"
            >
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
              <option value={90}>90 días</option>
              <option value={365}>1 año</option>
            </select>

            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, email, propiedad..."
              className="flex-1 min-w-[200px] border rounded px-3 py-1.5 bg-background"
            />
          </div>

          <div className="flex gap-3 text-xs text-muted-foreground pt-1">
            <span>Total: <strong className="text-foreground">{counts.all}</strong></span>
            <span>Nuevos: <strong className="text-blue-600">{counts.new}</strong></span>
            <span>Contactados: <strong className="text-amber-600">{counts.contacted}</strong></span>
            <span>Agendados: <strong className="text-emerald-600">{counts.scheduled}</strong></span>
          </div>
        </CardContent>
      </Card>

      {/* Lista de leads */}
      {loading && !leads ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : error ? (
        <Card className="border-[color:var(--destructive)]/40">
          <CardContent className="py-6 text-center text-sm text-[color:var(--destructive)]">
            {error}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No hay leads que coincidan con los filtros.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(lead => {
            const badge = statusBadge(lead.status)
            const Icon = badge.icon
            return (
              <button
                key={lead.id}
                type="button"
                onClick={() => setSelectedId(lead.id)}
                className="w-full text-left"
              >
                <Card className="hover:border-[color:var(--brand)]/40 transition cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-base">{lead.name}</span>
                          <Badge className={`text-xs ${badge.color}`}>
                            <Icon className="h-3 w-3 mr-1" />
                            {badge.label}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {SOURCE_LABELS[lead.source] ?? lead.source}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {lead.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {lead.email}
                            </span>
                          )}
                          {lead.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </span>
                          )}
                          {lead.properties && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {lead.properties.address}
                            </span>
                          )}
                        </div>
                        {lead.message && (
                          <p className="text-sm text-foreground/80 line-clamp-2 mt-1">
                            "{lead.message}"
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {relativeTime(lead.created_at)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </button>
            )
          })}
        </div>
      )}

      {/* Side sheet con detalle del lead */}
      {selectedId && (
        <LeadDetailSheet
          leadId={selectedId}
          userRole={userRole}
          userId={userId}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}
