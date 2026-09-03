import { NextRequest, NextResponse } from 'next/server'
import { checkAndAdvanceProperty, createProperty, getPropertiesListPage } from '@/lib/supabase/properties'
import { requireAuth } from '@/lib/auth/require-role'
import { notifyPropertyCreated } from '@/lib/email/notifications/property-created'
import { notifyWithEscalation } from '@/lib/email/notify-with-escalation'
import { geocodePropertyBestEffort } from '@/lib/properties/geocode-on-write'
import { esOperacion, OPERACIONES_VALORES } from '@/lib/properties/operacion'
import { resolverUbicacion, type SeleccionUbicacion } from '@/lib/properties/location-selection'
import { parsearPrecio } from '@/lib/filters/rango-precio'

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
    // Cohorte DERIVADA — la que el badge del listado calcula y `status` no sabe
    // contestar. Lista cerrada: un valor desconocido se ignora en vez de viajar
    // a la consulta.
    const cohorte = searchParams.get('cohorte') === 'sin_fotos' ? ('sin_fotos' as const) : undefined

    // Buscador de texto y rango de precio (opcionales — sin ellos la consulta
    // queda igual que antes de que existiera el buscador). El precio se
    // interpreta ACÁ y viaja como número: `parsearPrecio` entiende el punto de
    // miles argentino ("150.000" son ciento cincuenta mil, no ciento cincuenta)
    // y descarta cualquier cosa que no sea un número.
    const q = searchParams.get('q') || undefined
    const min = parsearPrecio(searchParams.get('min')) ?? undefined
    const max = parsearPrecio(searchParams.get('max')) ?? undefined

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
      { status, origin, from, to, assigned_to, cohorte, q, min, max },
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
    // `operation_type` es texto libre en Postgres: NO hay CHECK que avise. Un
    // valor fuera de los tres canónicos entra callado y después el daño es
    // silencioso — MercadoLibre no encuentra categoría y Argenprop cae en VENTA,
    // así que un alquiler temporario se publica como venta.
    if (body.operation_type !== undefined && !esOperacion(body.operation_type)) {
      return NextResponse.json(
        { error: `Operación inválida: "${body.operation_type}". Valores permitidos: ${OPERACIONES_VALORES.join(', ')}.` },
        { status: 400 },
      )
    }
    // La ubicación elegida del catálogo del portal MANDA sobre los textos del
    // formulario. Sin selector (portal caído) siguen valiendo
    // neighborhood/city/province como texto.
    //
    // `ubicacion` NO es una columna: si viajara en el payload, el INSERT
    // fallaría. Se borra sobre el objeto ya parseado (local a este request) en
    // vez de desestructurarlo, para no perder el tipado laxo del body: con
    // `const { ubicacion, ...resto } = body`, `address` pasa a ser `unknown` y
    // `createProperty` deja de compilar.
    const ubicacion = body.ubicacion as SeleccionUbicacion | undefined
    delete body.ubicacion
    let ubicacionPatch: Record<string, unknown> = {}
    if (ubicacion) {
      const resuelta = resolverUbicacion(ubicacion, {
        province: typeof body.province === 'string' ? body.province : null,
        city: typeof body.city === 'string' ? body.city : null,
        neighborhood: typeof body.neighborhood === 'string' ? body.neighborhood : null,
      })
      if (!resuelta.ok) return NextResponse.json({ error: resuelta.error }, { status: 400 })
      ubicacionPatch = { ...resuelta.patch }
    }

    const payload = {
      ...body,
      ...ubicacionPatch,
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

    // Una propiedad creada desde una tasación hereda las fotos: nace captada.
    // Sin esta llamada quedaba trabada para siempre, porque el auto-avance solo
    // corría al CONFIRMAR una subida de fotos — y ahí nunca se subió ninguna.
    // Best-effort: la propiedad ya existe, un fallo acá no puede tirar el alta.
    try { await checkAndAdvanceProperty(id) } catch (e) { console.error('[properties] auto-avance al crear:', e) }

    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
