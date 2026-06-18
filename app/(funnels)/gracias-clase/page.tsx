import type { Metadata } from 'next'
import { funnelMediaUrl } from '@/lib/funnel/media'
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
      videoUrl={funnelMediaUrl('web/clase-gracias-720p.mp4')}
      posterUrl={funnelMediaUrl('web/clase-gracias-poster.jpg')}
    />
  )
}
