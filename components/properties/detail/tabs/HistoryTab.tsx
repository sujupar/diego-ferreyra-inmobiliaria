'use client'

import { FlowHistoryCard, type FlowHistoryData } from '@/app/(dashboard)/_components/FlowHistoryCard'
import { LegalReviewHistory } from '@/components/properties/LegalReviewHistory'

// "Feedback de visitas" se mudó a la pestaña Visitas (spec §3.5).
interface Props {
  propertyId: string
  flowHistory: FlowHistoryData | null
}

export function HistoryTab({ propertyId, flowHistory }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Seguimiento</p>
        <h2 className="display text-xl mt-1">Historial</h2>
      </div>

      <FlowHistoryCard data={flowHistory} />

      <LegalReviewHistory propertyId={propertyId} />
    </div>
  )
}
