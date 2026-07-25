/**
 * E1.6 — Página del editor de landing (pantalla completa). Server component: gatea por
 * rol (abogado 403 → redirect) y carga la propiedad + la landing. Edita el borrador
 * (draft_content) si existe; si no, arranca del content publicado; si tampoco hay, del
 * template de lujo. La landing pública sólo cambia al "Publicar cambios".
 */
import { redirect, notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth/require-role'
import { authorizeLanding, getLanding, getProperty } from '@/lib/landing/landing-service'
import { safeParseLandingDocument } from '@/lib/landing/schema'
import { luxuryTemplate } from '@/lib/landing/templates/luxury'
import { LandingEditor } from '@/components/landing/editor/LandingEditor'

export default async function LandingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  const { id } = await params
  if (!(await authorizeLanding(id, user.id, user.profile.role))) redirect(`/properties/${id}`)

  const property = await getProperty(id)
  if (!property) notFound()

  const landing = await getLanding(id)
  if (!landing) redirect(`/properties/${id}`) // sin landing: se crea desde la ficha (asistente IA)

  const initialDocument =
    safeParseLandingDocument(landing.draft_content) ??
    safeParseLandingDocument(landing.content) ??
    luxuryTemplate.build(property)

  return (
    <LandingEditor
      propertyId={id}
      property={property}
      initialDocument={initialDocument}
      isPublished={landing.status === 'published'}
      publicSlug={landing.public_slug}
    />
  )
}
