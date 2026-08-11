'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BulkActionsBar } from '@/components/ui/BulkActionsBar'
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
  Trash2,
  RotateCcw,
} from 'lucide-react'
import { LeadDetailSheet } from './LeadDetailSheet'
import { isWhatsappUsable } from '@/lib/integrations/whatsapp/phone'
import { parametrosDeListado, usaVentanaDeFechas } from '@/components/inbox/lead-query'

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
  deleted_at?: string | null
  /** Número visible de comprador (#1042). Se asigna solo y no se reusa. */
  lead_number?: number | null
  suspected_bot?: boolean | null
  bot_reason?: string | null
  properties: {
    address: string
    title: string | null
    neighborhood: string | null
    assigned_to: string | null
  } | null
}

// Solo estos roles pueden ver/usar la Papelera (borrar y restaurar leads). El
// asesor puede ver el Inbox pero no borra ni restaura nada.
const OPS_ROLES = ['admin', 'dueno', 'coordinador']

/** Lee la respuesta como JSON tolerando que NO lo sea (mismo patrón que
 * `components/properties/LandingSection.tsx`): si una función se pasa del
 * tiempo máximo, el gateway devuelve HTML de error y `res.json()` explota con
 * "Unexpected token '<'" en vez de mostrar el problema real. */
async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    if (res.status === 504 || res.status === 502 || res.status === 408) {
      return { error: 'El servidor tardó demasiado y cortó la operación. Volvé a intentar.' } as never
    }
    return { error: `El servidor respondió algo inesperado (${res.status}). Volvé a intentar.` } as never
  }
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

export function InboxClient({
  userRole,
  userId,
  openLeadId,
}: {
  userRole: string
  userId: string
  /** Deep link desde otra pantalla (ej. "Ver lead en el CRM" del panel del cliente en WhatsApp) — abre el detalle de un lead puntual sin depender de los filtros activos. */
  openLeadId?: string | null
}) {
  const canManageTrash = OPS_ROLES.includes(userRole)
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeStatus, setActiveStatus] = useState<string>('new')
  const [activeSource, setActiveSource] = useState<string>('')
  const [days, setDays] = useState(30)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(openLeadId ?? null)
  const [view, setView] = useState<'active' | 'trash'>('active')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [bulkActioning, setBulkActioning] = useState(false)

  // Si el deep link llega DESPUÉS del primer render (mismo componente, cambió
  // solo el query param), igual hay que abrir el sheet — el useState inicial
  // de arriba solo cubre el primer montaje.
  useEffect(() => {
    if (openLeadId) setSelectedId(openLeadId)
  }, [openLeadId])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Qué se pide (y en qué casos NO se aplica la ventana de fechas) vive en
      // `components/inbox/lead-query.ts`, con sus tests. Dos casos no la usan:
      // la papelera y el estado "sin responder" — ver el comentario largo de
      // ese módulo.
      const params = parametrosDeListado({ view, days, status: activeStatus, source: activeSource })
      const res = await fetch(`/api/leads?${params.toString()}`)
      const data = await readJson<{ data?: LeadRow[] }>(res)
      if (!res.ok) throw new Error(data.error || 'Error al cargar leads')
      setLeads(data.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setLeads([])
    } finally {
      setLoading(false)
    }
  }, [activeStatus, activeSource, days, view])

  useEffect(() => {
    load()
    // refresca cada 60s
    const handle = setInterval(load, 60000)
    return () => clearInterval(handle)
  }, [load])

  // La selección no debe sobrevivir a un cambio de filtro/vista: evita
  // "eliminar seleccionados" sobre leads que ya no están en pantalla.
  useEffect(() => {
    setCheckedIds(new Set())
  }, [view, activeStatus, activeSource, days])

  const filtered = useMemo(() => {
    if (!leads) return []
    if (!search.trim()) return leads
    const q = search.toLowerCase()
    // Se puede buscar por el número de comprador con o sin '#': "#1042" y "1042"
    // encuentran lo mismo, que es como lo va a tipear cualquiera.
    const qNumero = q.replace(/^#/, '')
    return leads.filter(
      l =>
        l.name.toLowerCase().includes(q) ||
        (l.email ?? '').toLowerCase().includes(q) ||
        (l.phone ?? '').toLowerCase().includes(q) ||
        (l.properties?.address ?? '').toLowerCase().includes(q) ||
        (l.message ?? '').toLowerCase().includes(q) ||
        (l.lead_number != null && String(l.lead_number) === qNumero),
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

  function toggleChecked(id: string) {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleCheckAll() {
    setCheckedIds(prev => {
      if (filtered.length > 0 && prev.size === filtered.length) return new Set()
      return new Set(filtered.map(l => l.id))
    })
  }

  async function handleBulkDelete() {
    const ids = Array.from(checkedIds)
    if (ids.length === 0) return
    const noun = ids.length === 1 ? 'lead' : 'leads'
    if (
      !confirm(
        `¿Eliminar ${ids.length} ${noun}?\n\nSe pueden recuperar después desde la Papelera.`,
      )
    ) {
      return
    }
    setBulkActioning(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await readJson<{ deleted?: number }>(res)
      if (!res.ok) throw new Error(data.error || 'No se pudieron eliminar los leads')
      setCheckedIds(new Set())
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar los leads')
    } finally {
      setBulkActioning(false)
    }
  }

  async function restoreLeads(ids: string[]) {
    if (ids.length === 0) return
    setBulkActioning(true)
    try {
      const res = await fetch('/api/leads/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await readJson<{ restored?: number }>(res)
      if (!res.ok) throw new Error(data.error || 'No se pudieron restaurar los leads')
      setCheckedIds(new Set())
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al restaurar los leads')
    } finally {
      setBulkActioning(false)
    }
  }

  return (
    <div className="w-full space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="eyebrow">Pipeline comercial</p>
          <h1 className="display text-3xl">Inbox de leads</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {view === 'trash'
              ? 'Leads eliminados. Se pueden restaurar cuando quieras.'
              : userRole === 'asesor'
                ? 'Leads de tus propiedades.'
                : 'Todos los leads del equipo.'}
          </p>
        </div>
        {canManageTrash && (
          <div className="inline-flex rounded-lg border bg-muted/40 p-1 shrink-0">
            <button
              type="button"
              onClick={() => setView('active')}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === 'active' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Leads
            </button>
            <button
              type="button"
              onClick={() => setView('trash')}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === 'trash' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Papelera
            </button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-4 space-y-3">
          {view === 'active' && (
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
          )}

          {/* En la papelera estos dos filtros no se mandan al servidor, así que
              dejarlos en pantalla sería mentirle al usuario: los tocaría y no
              pasaría nada. La papelera muestra TODO lo borrado, sin recortes. */}
          {view === 'trash' ? (
            <p className="text-sm text-muted-foreground">
              Acá está todo lo que eliminaste, sin límite de fecha. Podés restaurar lo que quieras.
            </p>
          ) : (
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

            {/* En "Sin responder" no hay período: se muestran TODAS, sin
                importar cuándo entraron. Es el mismo número que cuenta el badge
                del menú y la tarjeta de Inicio; con una ventana de 30 días, un
                lead viejo sin contestar sumaba allá y acá no aparecía. Y un
                selector que no cambia nada es un control que miente, así que no
                se dibuja: se explica. */}
            {usaVentanaDeFechas(view, activeStatus) ? (
              <>
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
              </>
            ) : (
              <span className="ml-3 text-muted-foreground">
                Sin límite de fecha: están todas las que siguen sin responder, por viejas que sean.
              </span>
            )}
          </div>
          )}

          {/* La búsqueda sí sirve en las dos vistas: filtra en el cliente sobre
              lo que ya se cargó, así que también sirve para encontrar algo en la
              papelera. */}
          <div className="flex items-center gap-3 text-sm">
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, email, propiedad..."
              className="flex-1 min-w-[200px] border rounded px-3 py-1.5 bg-background"
            />
          </div>

          {view === 'active' ? (
            <div className="flex gap-3 text-xs text-muted-foreground pt-1">
              <span>Total: <strong className="text-foreground">{counts.all}</strong></span>
              <span>Nuevos: <strong className="text-blue-600">{counts.new}</strong></span>
              <span>Contactados: <strong className="text-amber-600">{counts.contacted}</strong></span>
              <span>Agendados: <strong className="text-emerald-600">{counts.scheduled}</strong></span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground pt-1">
              {counts.all} lead{counts.all !== 1 ? 's' : ''} en la papelera
            </div>
          )}

          {canManageTrash && filtered.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={checkedIds.size === filtered.length}
                onChange={toggleCheckAll}
                className="h-3.5 w-3.5 accent-[color:var(--brand)]"
              />
              Seleccionar todos ({filtered.length})
            </label>
          )}
        </CardContent>
      </Card>

      {canManageTrash && checkedIds.size > 0 && (
        <BulkActionsBar
          count={checkedIds.size}
          noun="leads"
          onClear={() => setCheckedIds(new Set())}
          actions={
            view === 'active'
              ? [
                  {
                    label: 'Eliminar seleccionados',
                    icon: <Trash2 className="h-4 w-4 mr-1" />,
                    variant: 'destructive',
                    onClick: handleBulkDelete,
                    disabled: bulkActioning,
                  },
                ]
              : [
                  {
                    label: 'Restaurar seleccionados',
                    icon: <RotateCcw className="h-4 w-4 mr-1" />,
                    variant: 'default',
                    onClick: () => restoreLeads(Array.from(checkedIds)),
                    disabled: bulkActioning,
                  },
                ]
          }
        />
      )}

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
            const cardBody = (
              <Card
                className={
                  view === 'active'
                    ? 'hover:border-[color:var(--brand)]/40 transition cursor-pointer'
                    : ''
                }
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Número de comprador: sirve para referirse a una persona
                            sin depender del nombre (hay homónimos y nombres falsos). */}
                        {lead.lead_number != null && (
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            #{lead.lead_number}
                          </span>
                        )}
                        <span className="font-medium text-base">{lead.name}</span>
                        <Badge className={`text-xs ${badge.color}`}>
                          <Icon className="h-3 w-3 mr-1" />
                          {badge.label}
                        </Badge>
                        {lead.suspected_bot && (
                          <Badge
                            className="text-xs bg-slate-600 text-white"
                            title={lead.bot_reason ?? undefined}
                          >
                            Posible bot
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {SOURCE_LABELS[lead.source] ?? lead.source}
                        </Badge>
                        {lead.phone && !isWhatsappUsable(lead.phone) && (
                          <Badge className="text-xs bg-amber-500 text-white">
                            Teléfono no válido para WhatsApp
                          </Badge>
                        )}
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
                      {view === 'trash' && lead.deleted_at
                        ? `Eliminado ${relativeTime(lead.deleted_at)}`
                        : relativeTime(lead.created_at)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
            return (
              <div key={lead.id} className="flex items-center gap-2">
                {canManageTrash && (
                  <input
                    type="checkbox"
                    checked={checkedIds.has(lead.id)}
                    onChange={() => toggleChecked(lead.id)}
                    aria-label={`Seleccionar lead ${lead.name}`}
                    className="h-4 w-4 shrink-0 accent-[color:var(--brand)]"
                  />
                )}
                {view === 'active' ? (
                  <button
                    type="button"
                    onClick={() => setSelectedId(lead.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    {cardBody}
                  </button>
                ) : (
                  <div className="flex-1 min-w-0">{cardBody}</div>
                )}
                {view === 'trash' && canManageTrash && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={bulkActioning}
                    onClick={() => restoreLeads([lead.id])}
                    className="shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Restaurar
                  </Button>
                )}
              </div>
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
