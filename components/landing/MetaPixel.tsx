'use client'

import { useEffect } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
  }
}

interface MetaPixelProps {
  pixelId: string
  propertyId: string
  propertyTitle: string
}

/**
 * Inyecta el Meta Pixel en la landing.
 *
 * Eventos disparados:
 *   - PageView: automático al cargar la página
 *   - ViewContent: en mount, con content_ids = [propertyId]
 *
 * El evento Lead se dispara desde LeadForm cuando el submit es exitoso.
 *
 * Si pixelId está vacío, no renderiza nada (kill switch via env).
 */
export function MetaPixel({ pixelId, propertyId, propertyTitle }: MetaPixelProps) {
  useEffect(() => {
    if (!pixelId || typeof window === 'undefined') return
    // Esperar a que el script base cargue antes de disparar ViewContent
    const timer = setTimeout(() => {
      if (typeof window.fbq === 'function') {
        window.fbq('track', 'ViewContent', {
          content_ids: [propertyId],
          content_name: propertyTitle,
          content_type: 'property',
          content_category: 'real_estate',
        })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [pixelId, propertyId, propertyTitle])

  // Defensa en profundidad: pixelId solo puede ser dígitos (Meta Pixel IDs).
  // Si la env var fue corrompida, no renderizamos.
  if (!pixelId || !/^\d+$/.test(pixelId)) return null

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${pixelId}');
            fbq('track', 'PageView');
          `,
        }}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  )
}

/**
 * Dispara el evento Lead. Llamado desde LeadForm tras submit exitoso.
 */
export function trackLead(input: {
  propertyId: string
  value?: number
  currency?: string
}): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return
  window.fbq('track', 'Lead', {
    content_ids: [input.propertyId],
    content_type: 'property',
    content_category: 'real_estate',
    value: input.value,
    currency: input.currency,
  })
}
