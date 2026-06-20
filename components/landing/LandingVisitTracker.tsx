'use client'

import { useEffect, useRef } from 'react'
import { readAttributionFromParams, persistAttribution } from '@/lib/funnel/attribution'

type FunnelType = 'clase_gratuita' | 'tasacion' | 'otro'

interface Props {
  slug: string
  funnelType?: FunnelType
}

/**
 * Cliente que dispara un POST a /api/landing/track-visit en el mount de la
 * landing. Captura UTM params + fbclid + gclid + referrer del browser.
 *
 * No bloquea ni reintenta: si el endpoint falla, la visita simplemente no se
 * registra. El componente es invisible (return null).
 */
export function LandingVisitTracker({ slug, funnelType = 'otro' }: Props) {
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) return
    sent.current = true

    const params = new URLSearchParams(window.location.search)
    const utm = {
      utm_source:   params.get('utm_source')   ?? undefined,
      utm_medium:   params.get('utm_medium')   ?? undefined,
      utm_campaign: params.get('utm_campaign') ?? undefined,
      utm_content:  params.get('utm_content')  ?? undefined,
      utm_term:     params.get('utm_term')     ?? undefined,
    }

    // Atribución Meta (UTM + IDs): persistir first-touch para que sobreviva la
    // navegación interna hasta el submit del formulario.
    persistAttribution(readAttributionFromParams(window.location.search))

    fetch('/api/landing/track-visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug,
        funnel_type: funnelType,
        utm,
        fbclid:   params.get('fbclid')   ?? undefined,
        gclid:    params.get('gclid')    ?? undefined,
        fb_campaign_id: params.get('fb_campaign_id') ?? undefined,
        fb_adset_id:    params.get('fb_adset_id')    ?? undefined,
        fb_ad_id:       params.get('fb_ad_id')       ?? undefined,
        fb_placement:   params.get('fb_placement')   ?? undefined,
        referrer: document.referrer || undefined,
      }),
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ })
  }, [slug, funnelType])

  return null
}
