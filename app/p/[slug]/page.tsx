import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { LandingHero } from '@/components/landing/Hero'
import { LandingGallery } from '@/components/landing/Gallery'
import { LandingVideoEmbed } from '@/components/landing/VideoEmbed'
import { LandingTour3DEmbed } from '@/components/landing/Tour3DEmbed'
import { LandingFeatures } from '@/components/landing/Features'
import { LandingDescription } from '@/components/landing/Description'
import { LandingLocationMap } from '@/components/landing/LocationMap'
import { LandingLeadForm } from '@/components/landing/LeadForm'

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

  return (
    <main className="min-h-screen bg-background">
      <LandingHero
        title={heroTitle}
        address={property.address}
        neighborhood={property.neighborhood}
        city={property.city}
        price={property.asking_price}
        currency={property.currency}
        operationType={property.operation_type}
        heroImage={property.photos?.[0]}
      />

      <LandingFeatures
        rooms={property.rooms}
        bedrooms={property.bedrooms}
        bathrooms={property.bathrooms}
        garages={property.garages}
        coveredArea={property.covered_area}
        totalArea={property.total_area}
        floor={property.floor}
        age={property.age}
        expensas={property.expensas}
        amenities={
          Array.isArray(property.amenities) ? (property.amenities as string[]) : []
        }
      />

      {property.photos && property.photos.length > 0 && (
        <LandingGallery photos={property.photos} />
      )}

      {property.video_url && <LandingVideoEmbed url={property.video_url} />}

      {property.tour_3d_url && <LandingTour3DEmbed url={property.tour_3d_url} />}

      {property.description && (
        <LandingDescription text={property.description} />
      )}

      {property.latitude != null && property.longitude != null && (
        <LandingLocationMap
          lat={property.latitude}
          lng={property.longitude}
          address={property.address}
        />
      )}

      <LandingLeadForm
        propertyId={property.id}
        propertyTitle={heroTitle}
      />
    </main>
  )
}
