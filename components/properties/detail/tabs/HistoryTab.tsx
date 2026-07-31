'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FlowHistoryCard, type FlowHistoryData } from '@/app/(dashboard)/_components/FlowHistoryCard'
import { LegalReviewHistory } from '@/components/properties/LegalReviewHistory'

export interface VisitFeedback {
  id: string
  response_source: 'advisor' | 'client'
  liked: boolean | null
  most_liked: string | null
  least_liked: string | null
  in_price: boolean | null
  hypothetical_offer: number | null
  responded_at: string
  visit: { id: string; scheduled_at: string; client_name: string } | null
}

interface Props {
  propertyId: string
  flowHistory: FlowHistoryData | null
  feedback: VisitFeedback[]
}

export function HistoryTab({ propertyId, flowHistory, feedback }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Seguimiento</p>
        <h2 className="display text-xl mt-1">Historial</h2>
      </div>

      <FlowHistoryCard data={flowHistory} />

      {feedback.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="display text-base">Feedback de visitas ({feedback.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {feedback.map(f => (
              <div key={f.id} className="border rounded-xl p-3 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge>{f.response_source === 'client' ? 'Cliente' : 'Asesor'}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {f.visit?.client_name} · visita {f.visit ? new Date(f.visit.scheduled_at).toLocaleDateString('es-AR') : ''}
                  </span>
                </div>
                <p>¿Le gustó? <strong>{f.liked === null ? '-' : f.liked ? 'Sí' : 'No'}</strong></p>
                {f.most_liked && <p>Más le gustó: {f.most_liked}</p>}
                {f.least_liked && <p>Menos le gustó: {f.least_liked}</p>}
                <p>¿En precio? <strong>{f.in_price === null ? '-' : f.in_price ? 'Sí' : 'No'}</strong></p>
                <p>Oferta hipotética: USD {f.hypothetical_offer ?? '-'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <LegalReviewHistory propertyId={propertyId} />
    </div>
  )
}
