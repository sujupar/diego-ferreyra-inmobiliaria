import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { MetaPixel } from '@/components/landing/MetaPixel'
import { LandingVisitTracker } from '@/components/landing/LandingVisitTracker'
import { LandingRenderer } from '@/components/landing/LandingRenderer'
import { LeadCaptureProvider } from '@/components/landing/LeadCaptureProvider'
import { FloatingCta } from '@/components/landing/luxury/FloatingCta'
import { getPublishedLanding } from '@/lib/landing/get-landing'
import { luxuryTemplate } from '@/lib/landing/templates/luxury'
import { deriveFunnelType } from '@/lib/landing/funnel-type'
import { destinoDeAlias } from '@/lib/landing/slug-alias'

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

/**
 * Slug ANTERIOR de una propiedad que fue renombrada.
 *
 * El enlace se arma con el tipo de propiedad, así que corregir un tipo mal
 * cargado cambia la URL — y la vieja ya vive dentro de anuncios pagos, mensajes
 * y mails. En vez de dejarla morir en un 404, se guarda en `previous_slugs` y
 * desde acá se redirige al enlace vigente.
 */
async function getPropertyByAlias(slug: string) {
  const supabase = getAdmin()
  const { data } = await supabase
    .from('properties')
    .select('public_slug')
    .contains('previous_slugs', [slug])
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
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)
  if (!property) {
    // Puede ser un enlace viejo de una propiedad renombrada. Se redirige
    // CONSERVANDO la query: ahí viajan los utm_* y el fbclid, y perderlos
    // dejaría sin atribuir la conversión que la campaña pagó por traer.
    // `permanentRedirect` va FUERA de cualquier try/catch: Next lo implementa
    // lanzando una excepción especial que no hay que atrapar.
    const alias = await getPropertyByAlias(slug)
    if (alias?.public_slug) {
      permanentRedirect(destinoDeAlias(alias.public_slug, await searchParams))
    }
    notFound()
  }

  const heroTitle =
    property.title ?? `${property.property_type} en ${property.neighborhood}`

  const pixelId = process.env.META_PIXEL_ID ?? ''

  // E1.2/E1.8 — Render schema-driven. Si la propiedad tiene una landing PUBLICADA,
  // se usa su documento (bloques editables). Si no, se sirve la estructura de
  // CONVERSIÓN (beneficios intangibles + CTAs a popup) con copy determinístico.
  const published = await getPublishedLanding(property.id)
  const document = published?.document ?? luxuryTemplate.build(property)

  // E1.0 — funnel_type real. Prioriza el congelado en la landing publicada;
  // si no hay, se deriva de la propiedad (server-side, nunca desde la URL).
  const funnelType = published?.funnelType ?? deriveFunnelType(property)

  return (
    // Sin bg-background (token del dashboard): deja ver el marfil de `.landing-root`
    // detrás de las secciones sin fondo propio (StoryBlocks, etc.).
    <main className="min-h-screen">
      <LandingVisitTracker slug={slug} funnelType={funnelType} />
      {pixelId && (
        <MetaPixel
          pixelId={pixelId}
          propertyId={property.id}
          propertyTitle={heroTitle}
        />
      )}
      {/* Los CTAs de la landing (incluido el flotante) abren este popup. */}
      <LeadCaptureProvider propertyId={property.id} propertyTitle={heroTitle}>
        <LandingRenderer document={document} property={property} />
        <FloatingCta />
      </LeadCaptureProvider>
    </main>
  )
}
