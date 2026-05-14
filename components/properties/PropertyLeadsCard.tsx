'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Mail, Phone, MessageSquare, ExternalLink } from 'lucide-react'

interface Lead {
  id: string
  name: string
  email: string | null
  phone: string | null
  message: string | null
  source: string
  status: string
  created_at: string
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  new: { label: 'Nuevo', color: 'bg-blue-500 text-white' },
  contacted: { label: 'Contactado', color: 'bg-amber-500 text-white' },
  scheduled: { label: 'Agendado', color: 'bg-emerald-600 text-white' },
  discarded: { label: 'Descartado', color: 'bg-gray-400 text-white' },
}

const SOURCE_LABEL: Record<string, string> = {
  landing: 'Landing',
  meta_form: 'Meta',
  portal_mercadolibre: 'ML',
  portal_argenprop: 'AP',
  portal_zonaprop: 'ZP',
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'recién'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d > 1 ? 's' : ''}`
}

export function PropertyLeadsCard({
  propertyId,
  compact = false,
}: {
  propertyId: string
  compact?: boolean
}) {
  const [leads, setLeads] = useState<Lead[] | null>(null)

  useEffect(() => {
    fetch(`/api/leads?propertyId=${propertyId}&days=365&limit=${compact ? 5 : 100}`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => setLeads(data ?? []))
      .catch(() => setLeads([]))
  }, [propertyId, compact])

  if (!leads) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="display text-base">
            Leads de esta propiedad
            {leads.length > 0 && (
              <span className="ml-2 text-sm text-muted-foreground tabular-nums">
                ({leads.length}
                {compact && leads.length >= 5 ? '+' : ''})
              </span>
            )}
          </CardTitle>
          {compact && leads.length > 0 && (
            <Link
              href={`/inbox`}
              className="text-xs text-[color:var(--brand)] underline"
            >
              Ver inbox →
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no llegaron consultas para esta propiedad.
          </p>
        ) : (
          <ul className="divide-y">
            {leads.map(l => {
              const badge = STATUS_LABEL[l.status] ?? { label: l.status, color: 'bg-gray-400 text-white' }
              return (
                <li key={l.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{l.name}</span>
                        <Badge className={`text-[10px] ${badge.color}`}>{badge.label}</Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {SOURCE_LABEL[l.source] ?? l.source}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-muted-foreground">
                        {l.email && (
                          <a
                            href={`mailto:${l.email}`}
                            className="flex items-center gap-1 hover:text-foreground"
                          >
                            <Mail className="h-3 w-3" />
                            {l.email}
                          </a>
                        )}
                        {l.phone && (
                          <a
                            href={`tel:${l.phone}`}
                            className="flex items-center gap-1 hover:text-foreground"
                          >
                            <Phone className="h-3 w-3" />
                            {l.phone}
                          </a>
                        )}
                        {l.phone && (
                          <a
                            href={`https://wa.me/${l.phone.replace(/[^\d]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:text-emerald-700"
                          >
                            <MessageSquare className="h-3 w-3" />
                            WhatsApp
                          </a>
                        )}
                      </div>
                      {l.message && !compact && (
                        <p className="text-xs text-foreground/80 mt-1.5 line-clamp-2">
                          {l.message}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">
                        {relativeTime(l.created_at)}
                      </span>
                      <Link
                        href="/inbox"
                        className="text-xs underline text-[color:var(--brand)] inline-flex items-center gap-0.5"
                      >
                        Abrir <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
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
