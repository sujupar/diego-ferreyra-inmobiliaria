import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { getProperty } from '@/lib/supabase/properties'
import { planLabelFromUrl } from '@/lib/properties/media'

/**
 * GET /api/whatsapp/property-info/[propertyId]
 *
 * Qué tiene cargado una propiedad para el botón "Enviar información de la
 * propiedad" del chat (task 9, prioridad 3). Alimenta la vista previa ANTES
 * de mandar nada — el brief exige mostrar qué se va a mandar y pedir
 * confirmación, nunca mandar a ciegas.
 *
 * Ofrece SOLO lo que la propiedad tenga cargado de verdad:
 *   - fotos: portada (primeras 3, mismo criterio de "portada" del resto del
 *     sistema) — se filtran los data-URI base64 legacy (A3 de la auditoría),
 *     Meta necesita una URL real para poder descargarla, no puede recibir un
 *     data: URI de varios MB.
 *   - video: `video_file_url` (archivo subido, no el `video_url` de portales).
 *   - recorrido: `tour_3d_url`.
 *   - planos: `plans` (mismo filtro anti-base64 que fotos).
 *   - landing: SOLO si `property_landings.status='published'` Y hay `public_slug`
 *     (mismo criterio que `getPublishedLanding` en `lib/landing/get-landing.ts`
 *     — no se toca ese archivo, se reimplementa la misma condición acá).
 *
 * Gate: mismo criterio que el resto del chat — operaciones + asesor; el
 * asesor solo puede pedir la info de SUS propiedades.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador', 'asesor']
const MAX_PHOTOS = 3
const MAX_PLANS = 5

function isRealUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//.test(v)
}

export async function GET(_req: Request, { params }: { params: Promise<{ propertyId: string }> }) {
  try {
    const user = await requireAuth()
    const role = user.profile.role
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { propertyId } = await params

    let property: Awaited<ReturnType<typeof getProperty>>
    try {
      property = await getProperty(propertyId)
    } catch {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    if (role === 'asesor' && property.assigned_to !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = admin()
    const { data: landingRow } = await supabase
      .from('property_landings')
      .select('id')
      .eq('property_id', propertyId)
      .eq('status', 'published')
      .maybeSingle()

    const photos: string[] = (Array.isArray(property.photos) ? property.photos : []).filter(isRealUrl)
    const plans: string[] = (Array.isArray(property.plans) ? property.plans : []).filter(isRealUrl)
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar').replace(/\/+$/, '')

    const landingAvailable = Boolean(landingRow) && Boolean(property.public_slug)

    const data = {
      property: { id: property.id, address: property.address, title: property.title ?? null },
      photos: {
        available: photos.length > 0,
        count: photos.length,
        // Preview + lo que REALMENTE se manda: portada (primeras 3), mismo
        // criterio de "portada" que la galería/Meta Ads.
        urls: photos.slice(0, MAX_PHOTOS),
      },
      video: { available: Boolean(property.video_file_url), url: property.video_file_url ?? null },
      tour: { available: Boolean(property.tour_3d_url), url: property.tour_3d_url ?? null },
      plans: {
        available: plans.length > 0,
        count: plans.length,
        items: plans.slice(0, MAX_PLANS).map((url: string) => ({ url, label: planLabelFromUrl(url) })),
      },
      landing: {
        available: landingAvailable,
        url: landingAvailable ? `${appUrl}/p/${property.public_slug}` : null,
      },
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
