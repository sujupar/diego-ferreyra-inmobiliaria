'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, CheckCircle, XCircle, FileText, MessageSquare, Send, RefreshCw } from 'lucide-react'
import { LEGAL_DOCS_CATALOG } from '@/types/legal-docs.types'

const ACTION_META: Record<string, { label: string; icon: any; color: string }> = {
  submitted: { label: 'Enviado a revisión', icon: Send, color: 'text-blue-600 bg-blue-100' },
  approved_item: { label: 'Documento aprobado', icon: CheckCircle, color: 'text-green-600 bg-green-100' },
  rejected_item: { label: 'Documento rechazado', icon: XCircle, color: 'text-red-600 bg-red-100' },
  approved_all: { label: 'Revisión legal completa', icon: CheckCircle, color: 'text-green-700 bg-green-200' },
  rejected_all: { label: 'Revisión legal rechazada', icon: XCircle, color: 'text-red-700 bg-red-200' },
  commented: { label: 'Comentario', icon: MessageSquare, color: 'text-gray-600 bg-gray-100' },
  resubmitted: { label: 'Reenviado tras corrección', icon: RefreshCw, color: 'text-amber-600 bg-amber-100' },
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getItemLabel(itemKey: string | null) {
  if (!itemKey) return ''
  const def = LEGAL_DOCS_CATALOG.find(d => d.key === itemKey)
  return def?.label || itemKey
}

export function LegalReviewHistory({ propertyId }: { propertyId: string }) {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/properties/${propertyId}/legal-events`)
      .then(r => r.json())
      .then(({ data }) => setEvents(data || []))
      .finally(() => setLoading(false))
  }, [propertyId])

  if (loading) return null
  if (!events.length) return null

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5" />Historial de Revisión Legal</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {events.map(ev => {
            const meta = ACTION_META[ev.action] || { label: ev.action, icon: FileText, color: 'text-gray-600 bg-gray-100' }
            const Icon = meta.icon
            return (
              <div key={ev.id} className="flex gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${meta.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 border-b pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">
                      {meta.label}
                      {ev.item_key && <span className="text-muted-foreground ml-1">· {getItemLabel(ev.item_key)}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(ev.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ev.actor_name} ({ev.actor_role})
                  </p>
                  {ev.notes && <p className="text-sm mt-1 italic text-muted-foreground">"{ev.notes}"</p>}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
