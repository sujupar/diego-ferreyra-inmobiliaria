import type { Metadata } from 'next'
import { LandingVisitTracker } from '@/components/landing/LandingVisitTracker'
import { getActiveTestimonials } from '@/lib/funnel/testimonials'
import { funnelMediaUrl } from '@/lib/funnel/media'
import { TASACION_CONTENT, TASACION_B_CONTENT, BRAND } from '@/lib/funnel/content'
import { getExperiment } from '@/lib/funnel/experiment'
import { variantePorClic } from '@/lib/funnel/ab-test'
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
 * NO SACAR. El sorteo del A/B ocurre en el servidor, en cada pedido. Si Next o la
 * CDN de Netlify llegaran a guardar esta página, TODO el mundo vería la variante
 * que salió en el primer pedido y el test quedaría 100/0 sin que nada falle ni
 * avise. Antes lo garantizaba de rebote la lectura de `cookies()`; desde que el
 * reparto es por clic esa lectura no existe más, así que se declara a mano.
 * Se verifica con `curl -I`: `cache-control: private, no-cache, no-store`.
 */
export const dynamic = 'force-dynamic'

/**
 * `/tasacion-directa` sirve una de dos landings según el experimento A/B.
 *
 * El reparto es POR CLIC (decisión del dueño, 2026-09-19): cada apertura se sortea
 * de nuevo con el porcentaje del panel, sin recordar qué vio esa persona antes.
 * El porqué y lo que se cede están en `variantePorClic` (`lib/funnel/ab-test.ts`).
 *
 * `?lp=B` fuerza una variante para poder revisarla. La visita se registra igual con
 * la variante que se sirvió: si mirás la B a propósito, cuenta como visita de la B.
 */
export default async function TasacionPage({
  searchParams,
}: {
  searchParams: Promise<{ lp?: string }>
}) {
  const [testimonials, sp] = await Promise.all([getActiveTestimonials(), searchParams])
  const pixelId = process.env.META_PIXEL_ID ?? ''

  const forced = sp?.lp === 'A' || sp?.lp === 'B' ? sp.lp : null
  const experiment = forced ? null : await getExperiment('tasacion')
  const variant = forced ?? variantePorClic(experiment)

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
