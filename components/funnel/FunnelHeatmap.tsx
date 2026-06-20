'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { getOrCreateAnonId } from '@/lib/funnel/anon-id'
import { readStoredAttribution } from '@/lib/funnel/attribution'

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void
  }
}

interface FunnelHeatmapProps {
  projectId: string
  contentName: string // 'Tasación Directa' | 'Clase Gratuita'
}

/**
 * Microsoft Clarity para las landings: heatmaps (click/scroll/área) + grabaciones
 * de sesión, SEGMENTADO por registrado/no-registrado vía custom tags. Usa el
 * mismo `df_anon` del proyecto (sin PII) → se puede cruzar con el CRM.
 *
 * Carga con strategy="afterInteractive" (igual que FunnelMetaPixel) → NO toca el
 * LCP. Si `projectId` no es válido, no carga nada (degrada en silencio).
 */
export function FunnelHeatmap({ projectId, contentName }: FunnelHeatmapProps) {
  const valid = /^[a-z0-9]+$/i.test(projectId)

  useEffect(() => {
    if (!valid) return
    let tries = 0
    const apply = (): boolean => {
      if (typeof window === 'undefined' || typeof window.clarity !== 'function') return false
      try {
        const anonId = getOrCreateAnonId()
        if (anonId) {
          window.clarity('identify', anonId)
          window.clarity('set', 'df_anon', anonId)
        }
        const registered =
          (typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('registered_contact_id')) ||
          /(?:^|;\s*)df_reg=1/.test(document.cookie)
        window.clarity('set', 'segment', registered ? 'registrado' : 'no_registrado')
        window.clarity('set', 'content', contentName)
        const attr = readStoredAttribution()
        if (attr?.utm_source) window.clarity('set', 'utm_source', attr.utm_source)
        if (attr?.utm_campaign) window.clarity('set', 'utm_campaign', attr.utm_campaign)
      } catch {
        /* tags best-effort */
      }
      return true
    }
    // El snippet de Clarity carga afterInteractive; reintentamos hasta que exista.
    if (apply()) return
    const iv = setInterval(() => {
      tries += 1
      if (apply() || tries > 25) clearInterval(iv)
    }, 200)
    return () => clearInterval(iv)
  }, [valid, contentName])

  if (!valid) return null

  return (
    <Script id="funnel-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${projectId}");`}
    </Script>
  )
}
