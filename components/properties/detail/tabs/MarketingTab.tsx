'use client'

import { PostCaptureActions } from '@/components/properties/PostCaptureActions'
import { LandingSection } from '@/components/properties/LandingSection'
import { MarketingTabs } from '@/components/properties/MarketingTabs'

interface Props {
  propertyId: string
  canManage: boolean
  videoRecorridoUrl: string | null
  tour3dUrl: string | null
  deliverMediaSaved: string | null
}

/**
 * Pestaña Difusión: canales arriba, el asistente de landing en el medio y los
 * resultados abajo. La tarjeta "Generar descripción para portales" se eliminó
 * a pedido del usuario (2026-07-31): cada asistente de portal ya genera la
 * descripción por su cuenta.
 */
export function MarketingTab({ propertyId, canManage, videoRecorridoUrl, tour3dUrl, deliverMediaSaved }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Marketing</p>
        <h2 className="display text-xl mt-1">Difusión y resultados</h2>
      </div>

      <PostCaptureActions propertyId={propertyId} />

      <LandingSection
        propertyId={propertyId}
        videoRecorridoUrl={videoRecorridoUrl}
        tour3dUrl={tour3dUrl}
        deliverMediaSaved={deliverMediaSaved}
      />

      <MarketingTabs propertyId={propertyId} canManage={canManage} />
    </div>
  )
}
