'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Mail, Phone, MessageSquare } from 'lucide-react'

interface InquiryRow {
  id: string
  seq: number
  portal: string
  inquiry_type: string | null
  received_at: string | null
  created_at: string
  lead_name: string | null
  lead_email: string | null
  lead_phone: string | null
  lead_message: string | null
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

/**
 * Pestaña "Consultas" de Marketing: las consultas de portales de ESTA propiedad
 * (vía portal_inquiries.property_id). Distinto de PropertyLeadsCard, que muestra
 * property_leads (landing/Meta) — son dos sistemas separados por diseño.
 */
export function PropertyInquiriesCard({ propertyId }: { propertyId: string }) {
  const [rows, setRows] = useState<InquiryRow[] | null>(null)

  useEffect(() => {
    fetch(`/api/portal-inquiries?propertyId=${propertyId}&days=365&limit=100`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => setRows(data ?? []))
      .catch(() => setRows([]))
  }, [propertyId])

  if (!rows) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="display text-base">
            Consultas de portales
            {rows.length > 0 && (
              <span className="ml-2 text-sm text-muted-foreground tabular-nums">
                ({rows.length}{rows.length >= 100 ? '+' : ''})
              </span>
            )}
          </CardTitle>
          {rows.length > 0 && (
            <Link href="/inbox" className="text-xs text-[color:var(--brand)] underline">
              Ver inbox →
            </Link>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Últimos 12 meses.</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no llegaron consultas de portales para esta propiedad.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map(r => {
              const phone = normalizePhone(r.lead_phone)
              return (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">#{r.seq}</span>
                        <span className="font-medium text-sm">{r.lead_name || '(sin nombre)'}</span>
                        <Badge variant="outline" className="text-[10px]">{PORTAL_LABELS[r.portal] ?? r.portal}</Badge>
                        {r.inquiry_type && (
                          <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[r.inquiry_type] ?? r.inquiry_type}</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-muted-foreground">
                        {r.lead_email && (
                          <a href={`mailto:${r.lead_email}`} className="flex items-center gap-1 hover:text-foreground">
                            <Mail className="h-3 w-3" />
                            {r.lead_email}
                          </a>
                        )}
                        {r.lead_phone && (
                          <a href={`tel:${r.lead_phone}`} className="flex items-center gap-1 hover:text-foreground">
                            <Phone className="h-3 w-3" />
                            {r.lead_phone}
                          </a>
                        )}
                        {phone && (
                          <a
                            href={`https://wa.me/${phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:text-emerald-700"
                          >
                            <MessageSquare className="h-3 w-3" />
                            WhatsApp
                          </a>
                        )}
                      </div>
                      {r.lead_message && (
                        <p className="text-xs text-foreground/80 mt-1.5 line-clamp-2">{r.lead_message}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(r.received_at ?? r.created_at)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
