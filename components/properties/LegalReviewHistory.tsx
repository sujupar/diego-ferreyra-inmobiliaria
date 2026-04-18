'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, CheckCircle, XCircle, FileText, MessageSquare, Send, RefreshCw } from 'lucide-react'
import { LEGAL_DOCS_CATALOG } from '@/types/legal-docs.types'

const ACTION_META: Record<string, { label: string; icon: any; color: string }> = {
  submitted: { label: 'Enviado a revisión', icon: Send, color: 'text-blue-700 bg-blue-100' },
  approved_item: { label: 'Documento aprobado', icon: CheckCircle, color: 'text-green-700 bg-green-100' },
  rejected_item: { label: 'Documento rechazado', icon: XCircle, color: 'text-red-700 bg-red-100' },
  approved_all: { label: 'Revisión legal completa', icon: CheckCircle, color: 'text-green-800 bg-green-200' },
  rejected_all: { label: 'Revisión legal rechazada', icon: XCircle, color: 'text-red-800 bg-red-200' },
  commented: { label: 'Comentario', icon: MessageSquare, color: 'text-slate-700 bg-slate-100' },
  resubmitted: { label: 'Reenviado tras corrección', icon: RefreshCw, color: 'text-amber-700 bg-amber-100' },
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
    <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Historial de Revisión Legal
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative">
          {events.map((ev, idx) => {
            const meta = ACTION_META[ev.action] || { label: ev.action, icon: FileText, color: 'text-slate-700 bg-slate-100' }
            const Icon = meta.icon
            const isLast = idx === events.length - 1
            return (
              <li key={ev.id} className="flex gap-3 relative">
                {/* Icon + connector line */}
                <div className="flex flex-col items-center shrink-0">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${meta.color} ring-4 ring-background`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  {!isLast && <div className="w-px flex-1 border-l-2 border-muted my-1 min-h-[16px]" />}
                </div>
                {/* Content */}
                <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {meta.label}
                      {ev.item_key && <span className="text-muted-foreground ml-1">· {getItemLabel(ev.item_key)}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                      {formatDateTime(ev.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ev.actor_name} ({ev.actor_role})
                  </p>
                  {ev.notes && (
                    <p className="text-sm mt-1 italic text-muted-foreground border-l-2 border-muted pl-2">
                      &ldquo;{ev.notes}&rdquo;
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
