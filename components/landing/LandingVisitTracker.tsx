'use client'

import { useEffect, useRef } from 'react'
import { readAttributionFromParams, persistAttribution, isUnsubstitutedMacro } from '@/lib/funnel/attribution'

// E1.0 — sumadas las landings de propiedad. Mantener sincronizado con
// ALLOWED_FUNNELS en app/api/landing/track-visit/route.ts y el CHECK de la DB.
type FunnelType = 'clase_gratuita' | 'tasacion' | 'venta_propiedad' | 'alto_valor' | 'otro'

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
    // Visor del mapa de calor (?hm_preview=1): no registrar la visita del admin.
    if (/[?&]hm_preview=1/.test(window.location.search)) return

    const params = new URLSearchParams(window.location.search)
    // Meta no sustituye los macros en publicaciones impulsadas → llegan literales
    // ("{{campaign.name}}"). Se descartan para no ensuciar los reportes.
    const clean = (k: string): string | undefined => {
      const v = params.get(k)
      return v && !isUnsubstitutedMacro(v) ? v : undefined
    }
    const utm = {
      utm_source:   clean('utm_source'),
      utm_medium:   clean('utm_medium'),
      utm_campaign: clean('utm_campaign'),
      utm_content:  clean('utm_content'),
      utm_term:     clean('utm_term'),
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
        fbclid:   clean('fbclid'),
        gclid:    clean('gclid'),
        fb_campaign_id: clean('fb_campaign_id') ?? clean('campaign_id'),
        fb_adset_id:    clean('fb_adset_id'),
        fb_ad_id:       clean('fb_ad_id'),
        fb_placement:   clean('fb_placement'),
        referrer: document.referrer || undefined,
      }),
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ })
  }, [slug, funnelType])

  return null
}
