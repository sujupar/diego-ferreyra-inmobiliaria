'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  X,
  Loader2,
  Mail,
  Phone,
  MessageSquare,
  ExternalLink,
  Building2,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Save,
} from 'lucide-react'

interface LeadDetail {
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
  utm: Record<string, string> | null
  created_at: string
  properties: {
    address: string
    title: string | null
    neighborhood: string | null
    public_slug: string | null
  } | null
}

const STATUS_ACTIONS = [
  { value: 'new', label: 'Nuevo', icon: Mail, color: 'bg-blue-500' },
  { value: 'contacted', label: 'Contactado', icon: Clock, color: 'bg-amber-500' },
  { value: 'scheduled', label: 'Agendado', icon: Calendar, color: 'bg-emerald-600' },
  { value: 'discarded', label: 'Descartado', icon: XCircle, color: 'bg-gray-500' },
] as const

const SOURCE_LABELS: Record<string, string> = {
  landing: 'Landing pública',
  meta_form: 'Meta Ads',
  portal_mercadolibre: 'MercadoLibre',
  portal_argenprop: 'Argenprop',
  portal_zonaprop: 'ZonaProp',
}

export function LeadDetailSheet({
  leadId,
  userRole,
  userId,
  onClose,
  onChanged,
}: {
  leadId: string
  userRole: string
  userId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [lead, setLead] = useState<LeadDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetch(`/api/leads/${leadId}`)
      .then(r => r.json())
      .then(({ data }) => {
        setLead(data ?? null)
        setNotes(data?.notes ?? '')
      })
      .catch(() => setLead(null))
      .finally(() => setLoading(false))
  }, [leadId])

  async function patch(update: Partial<{ status: string; notes: string | null }>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(update),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Error' }))
        alert(error || 'Error al guardar')
        return false
      }
      // Refrescar local + lista padre
      setLead(prev => (prev ? { ...prev, ...update } : prev))
      onChanged()
      return true
    } finally {
      setSaving(false)
    }
  }

  function close() {
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex justify-end"
      onClick={close}
    >
      <div
        className="w-full max-w-md h-full bg-background border-l shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : !lead ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Lead no encontrado.</p>
            <Button variant="ghost" onClick={close} className="mt-4">
              Cerrar
            </Button>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Lead</p>
                <h2 className="display text-2xl mt-1">{lead.name}</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Recibido {new Date(lead.created_at).toLocaleString('es-AR')}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={close} aria-label="Cerrar">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Datos de contacto */}
            <section className="space-y-2">
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-2 text-sm hover:underline"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {lead.email}
                </a>
              )}
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-2 text-sm hover:underline"
                >
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {lead.phone}
                </a>
              )}
              {lead.phone && (
                <a
                  href={`https://wa.me/${lead.phone.replace(/[^\d]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-emerald-700 hover:underline"
                >
                  <MessageSquare className="h-4 w-4" />
                  WhatsApp
                </a>
              )}
            </section>

            {/* Origen */}
            <section>
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Origen
              </h3>
              <Badge variant="outline">{SOURCE_LABELS[lead.source] ?? lead.source}</Badge>
              {lead.utm && Object.keys(lead.utm).length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                  {Object.entries(lead.utm).map(([k, v]) => (
                    <div key={k}>
                      <span className="font-medium">{k}:</span> {v}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Propiedad */}
            {lead.properties && (
              <section>
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Propiedad
                </h3>
                <div className="flex items-start gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">{lead.properties.title ?? lead.properties.address}</p>
                    <p className="text-xs text-muted-foreground">{lead.properties.address}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <a
                    href={`/properties/${lead.property_id}`}
                    className="inline-flex items-center gap-1 text-xs underline text-[color:var(--brand)]"
                  >
                    Ver propiedad <ExternalLink className="h-3 w-3" />
                  </a>
                  {lead.properties.public_slug && (
                    <a
                      href={`/p/${lead.properties.public_slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs underline text-[color:var(--brand)]"
                    >
                      Landing pública <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </section>
            )}

            {/* Mensaje */}
            {lead.message && (
              <section>
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Mensaje del cliente
                </h3>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                  {lead.message}
                </div>
              </section>
            )}

            {/* Estado */}
            <section>
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Estado
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_ACTIONS.map(s => {
                  const Icon = s.icon
                  const active = lead.status === s.value
                  return (
                    <button
                      key={s.value}
                      type="button"
                      disabled={saving || active}
                      onClick={() => patch({ status: s.value })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition ${
                        active
                          ? `${s.color} text-white`
                          : 'border bg-card hover:bg-muted'
                      } disabled:opacity-60`}
                    >
                      <Icon className="h-4 w-4" />
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Notas internas */}
            <section>
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Notas internas
              </h3>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={5}
                placeholder="Notas, próximos pasos, contexto del lead..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button
                size="sm"
                onClick={() => patch({ notes: notes || null })}
                disabled={saving || (notes ?? '') === (lead.notes ?? '')}
                className="mt-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Guardar nota
              </Button>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
