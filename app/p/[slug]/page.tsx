import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { MetaPixel } from '@/components/landing/MetaPixel'
import { LandingVisitTracker } from '@/components/landing/LandingVisitTracker'
import { LandingRenderer } from '@/components/landing/LandingRenderer'
import { LeadCaptureProvider } from '@/components/landing/LeadCaptureProvider'
import { getPublishedLanding } from '@/lib/landing/get-landing'
import { conversionTemplate } from '@/lib/landing/templates/conversion'
import { deriveFunnelType } from '@/lib/landing/funnel-type'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getPropertyBySlug(slug: string) {
  const supabase = getAdmin()
  const { data } = await supabase
    .from('properties')
    .select('*')
    .eq('public_slug', slug)
    .eq('status', 'approved')
    .maybeSingle()
  return data
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)
  if (!property) return { title: 'Propiedad no encontrada' }

  const title =
    property.title ?? `${property.property_type} en ${property.neighborhood}`
  const description = (
    property.description ?? `${property.address}, ${property.neighborhood}`
  ).slice(0, 160)
  const heroImage = property.photos?.[0]

  return {
    title: `${title} | Diego Ferreyra Inmobiliaria`,
    description,
    openGraph: {
      title,
      description,
      images: heroImage ? [{ url: heroImage }] : [],
      type: 'website',
      locale: 'es_AR',
    },
    twitter: {
      card: heroImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images: heroImage ? [heroImage] : [],
    },
    robots: { index: true, follow: true },
  }
}

export default async function PropertyLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)
  if (!property) notFound()

  const heroTitle =
    property.title ?? `${property.property_type} en ${property.neighborhood}`

  const pixelId = process.env.META_PIXEL_ID ?? ''

  // E1.2/E1.8 — Render schema-driven. Si la propiedad tiene una landing PUBLICADA,
  // se usa su documento (bloques editables). Si no, se sirve la estructura de
  // CONVERSIÓN (beneficios intangibles + CTAs a popup) con copy determinístico.
  const published = await getPublishedLanding(property.id)
  const document = published?.document ?? conversionTemplate.build(property)

  // E1.0 — funnel_type real. Prioriza el congelado en la landing publicada;
  // si no hay, se deriva de la propiedad (server-side, nunca desde la URL).
  const funnelType = published?.funnelType ?? deriveFunnelType(property)

  return (
    <main className="min-h-screen bg-background">
      <LandingVisitTracker slug={slug} funnelType={funnelType} />
      {pixelId && (
        <MetaPixel
          pixelId={pixelId}
          propertyId={property.id}
          propertyTitle={heroTitle}
        />
      )}
      {/* Los CTAs de la landing abren este popup (LeadCaptureProvider). */}
      <LeadCaptureProvider propertyId={property.id} propertyTitle={heroTitle}>
        <LandingRenderer document={document} property={property} />
      </LeadCaptureProvider>
    </main>
  )
}
