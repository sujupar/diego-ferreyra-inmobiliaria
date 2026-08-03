/**
 * Página del RECORRIDO (privada por token, sin login).
 *
 * Llega acá quien se registró en la landing: ve la propiedad por dentro (video
 * recorrido o tour 3D, según lo que eligió el asesor) y propone día y hora sin
 * volver a cargar sus datos — ya viajan en el token.
 */
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken, markTokenOpened } from '@/lib/leads/access-token'
import { resolveDeliverMedia } from '@/lib/properties/deliver-media'
import { toEmbedUrl } from '@/lib/landing/video-embed'
import { safeParseLandingDocument } from '@/lib/landing/schema'
import { renderThanks } from '@/lib/landing/thanks'
import { ThanksPageView } from '@/components/landing/thanks/ThanksPageView'
import { ThanksMedia } from '@/components/landing/thanks/ThanksMedia'
import { ScheduleVisitForm } from './ScheduleVisitForm'

export const dynamic = 'force-dynamic'

// Página privada por token con el nombre de una persona: fuera de los buscadores.
export const metadata = { robots: { index: false, follow: false } }

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function formatPrice(v: number | null, c: string | null): string {
  if (!v) return ''
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: c === 'ARS' ? 'ARS' : 'USD',
    minimumFractionDigits: 0,
  }).format(v)
}

export default async function RecorridoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const access = await getAccessToken(token)
  if (!access) notFound()

  const { data: property } = await admin()
    .from('properties')
    .select('id, address, neighborhood, city, asking_price, currency, photos, rooms, covered_area, video_recorrido_url, tour_3d_url, video_url, video_file_url, deliver_media, status')
    .eq('id', access.propertyId)
    .maybeSingle()
  if (!property) notFound()

  await markTokenOpened(token)

  const media = resolveDeliverMedia(property)
  // 'video_propio' (2026-08-02): el video "de marketing" de la propiedad
  // (video_url/video_file_url) cuando no hay recorrido dedicado ni tour 3D.
  // Se renderiza IGUAL que video_recorrido: si es un link externo (YouTube/
  // Vimeo) se embebe, si es un archivo subido va directo en un <video>.
  const embed = media.url ? toEmbedUrl(media.url) : null
  const fotos = (property.photos ?? []) as string[]

  // Textos editables de esta página (editor → "Página de gracias"). Se lee el
  // contenido PUBLICADO, nunca el borrador: lo que el asesor está retocando no
  // puede aparecerle al cliente. Sin landing, o sin la clave `thanks`, salen
  // los textos por defecto de siempre.
  const { data: landing } = await admin()
    .from('property_landings')
    .select('content')
    .eq('property_id', property.id)
    .maybeSingle()
  const thanksTexts = renderThanks(
    { address: property.address, mediaKind: media.kind },
    safeParseLandingDocument(landing?.content)?.thanks,
    { nombre: access.name.split(' ')[0], direccion: property.address },
  )

  return (
    <ThanksPageView
      texts={thanksTexts}
      subtitle={`${property.neighborhood}${property.city ? `, ${property.city}` : ''} · ${formatPrice(property.asking_price, property.currency)}`}
      media={<ThanksMedia kind={media.kind} url={media.url} embed={embed} photos={fotos} />}
      // La propiedad puede haberse vendido/descartado después de mandar el link:
      // en ese caso no ofrecemos agendar una visita que no va a existir.
      available={property.status === 'approved'}
      scheduleSlot={<ScheduleVisitForm token={token} clientName={access.name} />}
    />
  )
}
