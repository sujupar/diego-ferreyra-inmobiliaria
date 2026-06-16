'use client'

import { useEffect } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
  }
}

interface FunnelMetaPixelProps {
  pixelId: string
  contentName: string // 'Tasación Directa' | 'Clase Gratuita'
}

/** Pixel para landings de funnel: PageView (auto) + ViewContent (on-mount). */
export function FunnelMetaPixel({ pixelId, contentName }: FunnelMetaPixelProps) {
  const valid = /^\d+$/.test(pixelId)

  useEffect(() => {
    if (!valid || typeof window === 'undefined' || typeof window.fbq !== 'function') return
    window.fbq('track', 'ViewContent', {
      content_name: contentName,
      content_category: 'real_estate',
      content_type: 'lead_funnel',
    })
  }, [valid, contentName])

  if (!valid) return null

  return (
    <Script id="funnel-meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window,document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init','${pixelId}');fbq('track','PageView');`}
    </Script>
  )
}

/** Dispara la conversión del funnel con el MISMO event_id que el CAPI (dedup). */
export function trackFunnelConversion(input: {
  eventName: 'Lead' | 'CompleteRegistration'
  eventId: string
  contentName: string
}): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return
  window.fbq(
    'track',
    input.eventName,
    { content_name: input.contentName, content_category: 'real_estate', content_type: 'lead_funnel' },
    { eventID: input.eventId },
  )
}

/** Lee cookies de Meta (_fbp / _fbc) para advanced matching. */
export function getMetaCookie(name: '_fbp' | '_fbc'): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}
