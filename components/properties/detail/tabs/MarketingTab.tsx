'use client'

import { useState } from 'react'
import { PostCaptureActions } from '@/components/properties/PostCaptureActions'
import { LandingSection } from '@/components/properties/LandingSection'
import { MarketingTabs } from '@/components/properties/MarketingTabs'

interface Props {
  propertyId: string
  canManage: boolean
  videoRecorridoUrl: string | null
  tour3dUrl: string | null
  /** Video "de marketing" de la propiedad — cuenta como entregable de respaldo (2026-08-02). */
  videoUrl: string | null
  videoFileUrl: string | null
  deliverMediaSaved: string | null
}

/**
 * Pestaña Difusión: canales arriba, el asistente de landing en el medio y los
 * resultados abajo. La tarjeta "Generar descripción para portales" se eliminó
 * a pedido del usuario (2026-07-31): cada asistente de portal ya genera la
 * descripción por su cuenta.
 */
export function MarketingTab({ propertyId, canManage, videoRecorridoUrl, tour3dUrl, videoUrl, videoFileUrl, deliverMediaSaved }: Props) {
  // El botón "Crear landing" de la tarjeta de arriba dispara la MISMA creación
  // que la sección de abajo (antes linkeaba al editor, que sin landing
  // redirigía a la ficha: "no hacía nada"). Un contador, no un booleano, para
  // que dos toques seguidos cuenten como dos pedidos.
  const [autoStartLanding, setAutoStartLanding] = useState(0)
  // Cuando la landing se publica o se borra, la tarjeta de arriba se vuelve a
  // montar (y a cargar): si no, seguía diciendo "Sin landing" junto al enlace.
  const [versionTarjetas, setVersionTarjetas] = useState(0)
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Marketing</p>
        <h2 className="display text-xl mt-1">Difusión y resultados</h2>
      </div>

      <PostCaptureActions key={versionTarjetas} propertyId={propertyId} onCrearLanding={() => setAutoStartLanding(n => n + 1)} />

      <LandingSection
        propertyId={propertyId}
        autoStartToken={autoStartLanding}
        onChanged={() => setVersionTarjetas(v => v + 1)}
        videoRecorridoUrl={videoRecorridoUrl}
        tour3dUrl={tour3dUrl}
        videoUrl={videoUrl}
        videoFileUrl={videoFileUrl}
        deliverMediaSaved={deliverMediaSaved}
      />

      <MarketingTabs propertyId={propertyId} canManage={canManage} />
    </div>
  )
}
