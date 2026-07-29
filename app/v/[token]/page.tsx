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
import { ScheduleVisitForm } from './ScheduleVisitForm'

export const dynamic = 'force-dynamic'

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
    .select('id, address, neighborhood, city, asking_price, currency, photos, rooms, covered_area, video_recorrido_url, tour_3d_url, deliver_media')
    .eq('id', access.propertyId)
    .maybeSingle()
  if (!property) notFound()

  await markTokenOpened(token)

  const media = resolveDeliverMedia(property)
  const embed = media.kind === 'video_recorrido' && media.url ? toEmbedUrl(media.url) : null
  const fotos = (property.photos ?? []) as string[]

  return (
    <div className="landing-root min-h-screen">
      <main className="mx-auto max-w-4xl px-5 py-10 md:py-16">
        <p className="lx-eyebrow">Hola {access.name.split(' ')[0]}</p>
        <h1 className="mt-2 text-3xl md:text-5xl">Conocé {property.address} por dentro</h1>
        <p className="mt-2 text-black/60">
          {property.neighborhood}{property.city ? `, ${property.city}` : ''} · {formatPrice(property.asking_price, property.currency)}
        </p>

        <section className="mt-8">
          {media.kind === 'tour_3d' && media.url && (
            <iframe
              src={media.url}
              title="Recorrido virtual"
              className="aspect-video w-full rounded-lg border"
              allow="fullscreen; xr-spatial-tracking"
            />
          )}
          {media.kind === 'video_recorrido' && media.url && (
            embed ? (
              <iframe
                src={embed}
                title="Video recorrido"
                className="aspect-video w-full rounded-lg border"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video src={media.url} controls playsInline className="aspect-video w-full rounded-lg border" />
            )
          )}
          {media.kind === 'fotos' && fotos.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {fotos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" loading="lazy" className="aspect-square w-full rounded object-cover" />
              ))}
            </div>
          )}
          {media.kind === 'fotos' && fotos.length === 0 && (
            <p className="text-black/60">
              Estamos preparando el material de esta propiedad. Un asesor se va a contactar con vos para mostrártela.
            </p>
          )}
        </section>

        <section className="mt-12">
          <h2 className="text-2xl md:text-3xl">¿Querés visitarla?</h2>
          <p className="mt-2 text-black/60">
            Elegí el día y el momento que te queda cómodo. Nuestro equipo te contacta para confirmarla.
          </p>
          <ScheduleVisitForm token={token} clientName={access.name} />
        </section>
      </main>
    </div>
  )
}
