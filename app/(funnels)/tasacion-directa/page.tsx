import type { Metadata } from 'next'
import { LandingVisitTracker } from '@/components/landing/LandingVisitTracker'
import { getActiveTestimonials } from '@/lib/funnel/testimonials'
import { funnelMediaUrl } from '@/lib/funnel/media'
import { TASACION_CONTENT, BRAND } from '@/lib/funnel/content'
import { TasacionClient } from './TasacionClient'

export const metadata: Metadata = {
  title: 'Tasación Estratégica Gratuita | Diego Ferreyra Inmobiliaria',
  description: TASACION_CONTENT.hero.subhead,
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Tasación Estratégica Gratuita',
    description: TASACION_CONTENT.hero.headline,
    type: 'website',
  },
}

export default async function TasacionPage() {
  const testimonials = await getActiveTestimonials()
  const pixelId = process.env.META_PIXEL_ID ?? ''
  return (
    <>
      <LandingVisitTracker slug="tasacion-directa" funnelType="tasacion" />
      <TasacionClient
        testimonials={testimonials}
        heroVideoUrl={funnelMediaUrl(TASACION_CONTENT.hero.videoPath)}
        heroPosterUrl={funnelMediaUrl(TASACION_CONTENT.hero.posterPath)}
        logoUrl={funnelMediaUrl(BRAND.logoPath)}
        pixelId={pixelId}
        clarityId={process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? ''}
      />
    </>
  )
}
