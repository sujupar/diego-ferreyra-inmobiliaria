import type { Metadata } from 'next'
import { LandingVisitTracker } from '@/components/landing/LandingVisitTracker'
import { getActiveTestimonials } from '@/lib/funnel/testimonials'
import { funnelMediaUrl } from '@/lib/funnel/media'
import { CLARITY_PROJECT_ID } from '@/lib/funnel/clarity'
import { CLASE_CONTENT } from '@/lib/funnel/content'
import { ClaseClient } from './ClaseClient'

export const metadata: Metadata = {
  title: '[Clase GRATUITA] Para Propietarios en CABA y Zona Norte',
  description: CLASE_CONTENT.hero.subhead,
  robots: { index: true, follow: true },
  openGraph: { title: CLASE_CONTENT.hero.headline, description: CLASE_CONTENT.hero.subhead, type: 'website' },
}

export default async function ClasePage() {
  const testimonials = await getActiveTestimonials()
  const pixelId = process.env.META_PIXEL_ID ?? ''
  return (
    <>
      <LandingVisitTracker slug="vsl-clase-propietarios" funnelType="clase_gratuita" />
      <ClaseClient
        testimonials={testimonials}
        vslUrl={funnelMediaUrl(CLASE_CONTENT.hero.videoPath)}
        vslPoster={funnelMediaUrl(CLASE_CONTENT.hero.posterPath)}
        headshotUrl={funnelMediaUrl(CLASE_CONTENT.bio.headshotPath)}
        pixelId={pixelId}
        clarityId={CLARITY_PROJECT_ID}
      />
    </>
  )
}
