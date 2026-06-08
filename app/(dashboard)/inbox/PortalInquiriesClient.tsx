'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Mail, Phone, Building2, MessageCircle, AlertTriangle, User } from 'lucide-react'

interface InquiryRow {
  id: string
  seq: number
  portal: string
  inquiry_type: string | null
  received_at: string | null
  lead_name: string | null
  lead_email: string | null
  lead_phone: string | null
  lead_message: string | null
  property_external_code: string | null
  property_url: string | null
  property_address: string | null
  assigned_to: string | null
  assigned_name: string | null
  is_unmatched: boolean
  raw_subject: string | null
  created_at: string
}

const PORTAL_LABELS: Record<string, string> = {
  mercadolibre: 'MercadoLibre',
  zonaprop: 'ZonaProp',
  argenprop: 'Argenprop',
}

const TYPE_LABELS: Record<string, string> = {
  mail: 'Mail',
  whatsapp: 'WhatsApp',
  phone: 'Teléfono',
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

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null
  let d = raw.replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (!d.startsWith('54') && d.length >= 10 && d.length <= 11) d = `54${d}`
  return d.length >= 10 ? d : null
}

export function PortalInquiriesClient({ userRole }: { userRole: string }) {
  const [rows, setRows] = useState<InquiryRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [portal, setPortal] = useState('')
  const [onlyUnmatched, setOnlyUnmatched] = useState(false)
  const [days, setDays] = useState(30)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ days: String(days), limit: '200' })
      if (portal) params.set('portal', portal)
      if (onlyUnmatched) params.set('unmatched', '1')
      const res = await fetch(`/api/portal-inquiries?${params.toString()}`)
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: 'Error' }))
        throw new Error(msg || 'Error al cargar consultas')
      }
      const { data } = await res.json()
      setRows(data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [portal, onlyUnmatched, days])

  useEffect(() => {
    load()
    const handle = setInterval(load, 60000)
    return () => clearInterval(handle)
  }, [load])

  const filtered = useMemo(() => {
    if (!rows) return []
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(
      r =>
        (r.lead_name ?? '').toLowerCase().includes(q) ||
        (r.lead_email ?? '').toLowerCase().includes(q) ||
        (r.lead_phone ?? '').toLowerCase().includes(q) ||
        (r.property_address ?? '').toLowerCase().includes(q) ||
        (r.lead_message ?? '').toLowerCase().includes(q),
    )
  }, [rows, search])

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Portales</p>
        <h1 className="display text-3xl">Inbox de consultas</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {userRole === 'asesor'
            ? 'Consultas de tus propiedades en MercadoLibre, ZonaProp y Argenprop.'
            : 'Consultas entrantes de los portales (MercadoLibre, ZonaProp, Argenprop).'}
        </p>
      </div>

      <Card>
        <CardContent className="py-4 flex items-center gap-3 flex-wrap text-sm">
          <span className="font-medium">Portal:</span>
          <select value={portal} onChange={e => setPortal(e.target.value)} className="border rounded px-2 py-1 bg-background">
            <option value="">Todos</option>
            <option value="mercadolibre">MercadoLibre</option>
            <option value="zonaprop">ZonaProp</option>
            <option value="argenprop">Argenprop</option>
          </select>

          <span className="font-medium ml-3">Período:</span>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="border rounded px-2 py-1 bg-background">
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
          </select>

          <label className="flex items-center gap-1.5 ml-3 cursor-pointer">
            <input type="checkbox" checked={onlyUnmatched} onChange={e => setOnlyUnmatched(e.target.checked)} />
            Solo sin asignar
          </label>

          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email, propiedad..."
            className="flex-1 min-w-[200px] border rounded px-3 py-1.5 bg-background"
          />
        </CardContent>
      </Card>

      {loading && !rows ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : error ? (
        <Card className="border-[color:var(--destructive)]/40">
          <CardContent className="py-6 text-center text-sm text-[color:var(--destructive)]">{error}</CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No hay consultas que coincidan con los filtros.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const phone = normalizePhone(r.lead_phone)
            const waLink = phone
              ? `https://wa.me/${phone}?text=${encodeURIComponent(`Hola ${r.lead_name ?? ''}, buen día! Te escribo por tu consulta de la propiedad${r.property_address ? ` en ${r.property_address}` : ''}.`)}`
              : null
            return (
              <Card key={r.id} className={r.is_unmatched ? 'border-amber-400/50' : ''}>
                <CardContent className="py-4 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground font-mono">#{r.seq}</span>
                    <span className="font-medium text-base">{r.lead_name || '(sin nombre)'}</span>
                    <Badge variant="outline" className="text-xs">{PORTAL_LABELS[r.portal] ?? r.portal}</Badge>
                    {r.inquiry_type && <Badge variant="outline" className="text-xs">{TYPE_LABELS[r.inquiry_type] ?? r.inquiry_type}</Badge>}
                    {r.is_unmatched ? (
                      <Badge className="text-xs bg-amber-500 text-white">
                        <AlertTriangle className="h-3 w-3 mr-1" />Sin asignar
                      </Badge>
                    ) : (
                      <Badge className="text-xs bg-emerald-600 text-white">
                        <User className="h-3 w-3 mr-1" />{r.assigned_name ?? 'Asignado'}
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{relativeTime(r.created_at)}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {r.lead_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{r.lead_email}</span>}
                    {r.lead_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.lead_phone}</span>}
                    {(r.property_address || r.property_url) && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {r.property_url ? (
                          <a href={r.property_url} target="_blank" rel="noopener noreferrer" className="underline">
                            {r.property_address || 'Ver aviso'}
                          </a>
                        ) : (
                          r.property_address
                        )}
                      </span>
                    )}
                  </div>

                  {r.lead_message && <p className="text-sm text-foreground/80 line-clamp-3 mt-1">&ldquo;{r.lead_message}&rdquo;</p>}

                  {waLink && (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:underline pt-1"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Responder por WhatsApp
                    </a>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
