import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { LandingVisitTracker } from '@/components/landing/LandingVisitTracker'
import { getActiveTestimonials } from '@/lib/funnel/testimonials'
import { funnelMediaUrl } from '@/lib/funnel/media'
import { TASACION_CONTENT, TASACION_B_CONTENT, BRAND } from '@/lib/funnel/content'
import { getExperiment } from '@/lib/funnel/experiment'
import { decideVariant, rollFromCookie, AB_ROLL_COOKIE } from '@/lib/funnel/ab-test'
import { TasacionClient } from './TasacionClient'
import { TasacionNetaClient } from './TasacionNetaClient'

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

/**
 * `/tasacion-directa` sirve una de dos landings según el experimento A/B.
 *
 * La variante se resuelve ACÁ y no en el middleware a propósito: el middleware
 * corre en cada request y no puede pegarle a Postgres sin sumarle latencia a
 * tráfico pago. Él solo deja un número al azar en una cookie; la decisión —que
 * necesita la configuración vigente— se toma en el servidor de esta página.
 *
 * `?lp=B` fuerza una variante para poder revisarla antes de encender el test.
 * No ensucia la medición porque la visita se registra igual con la variante que
 * se sirvió: si mirás la B a propósito, cuenta como visita de la B.
 */
export default async function TasacionPage({
  searchParams,
}: {
  searchParams: Promise<{ lp?: string }>
}) {
  const [testimonials, cookieStore, sp] = await Promise.all([
    getActiveTestimonials(),
    cookies(),
    searchParams,
  ])
  const pixelId = process.env.META_PIXEL_ID ?? ''

  const forced = sp?.lp === 'A' || sp?.lp === 'B' ? sp.lp : null
  const experiment = forced ? null : await getExperiment('tasacion')
  const variant =
    forced ?? decideVariant(experiment, rollFromCookie(cookieStore.get(AB_ROLL_COOKIE)?.value))

  const logoUrl = funnelMediaUrl(BRAND.logoPath)

  if (variant === 'B') {
    return (
      <>
        <LandingVisitTracker slug="tasacion-directa" funnelType="tasacion" landingVariant="B" />
        <TasacionNetaClient
          testimonials={testimonials}
          heroVideoUrl={funnelMediaUrl(TASACION_B_CONTENT.hero.videoPath)}
          heroPosterUrl={funnelMediaUrl(TASACION_B_CONTENT.hero.posterPath)}
          logoUrl={logoUrl}
          pixelId={pixelId}
        />
      </>
    )
  }

  return (
    <>
      <LandingVisitTracker slug="tasacion-directa" funnelType="tasacion" landingVariant="A" />
      <TasacionClient
        testimonials={testimonials}
        heroVideoUrl={funnelMediaUrl(TASACION_CONTENT.hero.videoPath)}
        heroPosterUrl={funnelMediaUrl(TASACION_CONTENT.hero.posterPath)}
        logoUrl={logoUrl}
        pixelId={pixelId}
      />
    </>
  )
}
