import type { Metadata } from 'next'
import { funnelMediaUrl, r2MediaUrl } from '@/lib/funnel/media'
import { GraciasClaseClient } from './GraciasClaseClient'

export const metadata: Metadata = {
  title: '¡Ya estás dentro! | Clase',
  robots: { index: false, follow: false },
}

export default function GraciasClase() {
  const pixelId = process.env.META_PIXEL_ID ?? ''
  return (
    <GraciasClaseClient
      pixelId={pixelId}
      logoUrl={funnelMediaUrl('raw/682c6cc8e10a088724d26be6.png')}
      videoUrl={r2MediaUrl('clase-completa-r2.mp4')}
      posterUrl={funnelMediaUrl('web/clase-gracias-poster.jpg')}
    />
  )
}
