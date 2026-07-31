import { NextRequest, NextResponse } from 'next/server'
import { createProperty, getPropertiesListPage } from '@/lib/supabase/properties'
import { requireAuth } from '@/lib/auth/require-role'
import { notifyPropertyCreated } from '@/lib/email/notifications/property-created'
import { notifyWithEscalation } from '@/lib/email/notify-with-escalation'
import { geocodePropertyBestEffort } from '@/lib/properties/geocode-on-write'

const DEFAULT_PAGE_SIZE = 24
const MAX_PAGE_SIZE = 100

// Listado (A3 de la auditoría, .superpowers/sdd/2026-07-31-campana-y-chat-pro/task-7-brief.md):
// lee de vw_properties_list (portada + conteo, sin el array photos completo) y
// pagina de a 24 por default. El detalle de una propiedad puntual sigue
// trayendo TODO vía GET /api/properties/[id] (getProperty, sin cambios).
export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const origin = searchParams.get('origin') || undefined
    const from = searchParams.get('from') || undefined
    const to = searchParams.get('to') || undefined
    const assigned_to = searchParams.get('assigned_to') || undefined

    const limitParam = Number(searchParams.get('limit'))
    const offsetParam = Number(searchParams.get('offset'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0

    // Orden real en el servidor (hallazgo #7): `?sort=<columna>&dir=asc|desc`.
    // `getPropertiesListPage`/`resolvePropertiesListSort` valida `sort` contra
    // un whitelist — acá solo se arma el objeto, sin confiar en el string crudo.
    const sortParam = searchParams.get('sort')
    const dirParam = searchParams.get('dir')
    const sort = sortParam ? { key: sortParam, dir: dirParam === 'asc' ? ('asc' as const) : ('desc' as const) } : undefined

    const { data, total, hasMore } = await getPropertiesListPage(
      { status, origin, from, to, assigned_to },
      { limit, offset },
      sort
    )
    return NextResponse.json({ data, total, hasMore })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    // El asesor (quién la muestra) es OBLIGATORIO: define a quién se rutean las
    // consultas de portales. Antes había un default silencioso a user.id que
    // asignaba a quien cargaba el alta (no necesariamente quién la muestra).
    if (!body.assigned_to || typeof body.assigned_to !== 'string') {
      return NextResponse.json({ error: 'Debe asignarse un asesor (quién muestra la propiedad).' }, { status: 400 })
    }
    const payload = {
      ...body,
      created_by: body.created_by ?? user.id,
      assigned_to: body.assigned_to,
    }
    const id = await createProperty(payload)

    await geocodePropertyBestEffort(id) // best-effort, nunca lanza

    // N4: notificar coordinador+admins+dueños (y asesor como CC).
    // Si falla, escala a admins.
    await notifyWithEscalation(
      () => notifyPropertyCreated(id),
      { failedNotificationType: 'property_created', entityType: 'property', entityId: id },
    )

    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
