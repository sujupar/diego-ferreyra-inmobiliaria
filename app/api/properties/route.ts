import { NextRequest, NextResponse } from 'next/server'
import { checkAndAdvanceProperty, createProperty, getPropertiesListPage, updateProperty } from '@/lib/supabase/properties'
import { createClient } from '@supabase/supabase-js'
import { esFotoIncrustada } from '@/lib/properties/fotos-incrustadas'
import { materializarFotosIncrustadas, subidorStorage } from '@/lib/properties/materializar-fotos'
import { sanearValoresAtributo, sanearRespuestasLanding } from '@/lib/supabase/visit-data-sanear'
import { requireAuth } from '@/lib/auth/require-role'
import { notifyPropertyCreated } from '@/lib/email/notifications/property-created'
import { notifyWithEscalation } from '@/lib/email/notify-with-escalation'
import { geocodePropertyBestEffort } from '@/lib/properties/geocode-on-write'
import { esOperacion, OPERACIONES_VALORES } from '@/lib/properties/operacion'
import { resolverUbicacion, type SeleccionUbicacion } from '@/lib/properties/location-selection'
import { parsearPrecio } from '@/lib/filters/rango-precio'
import { linkPropertyToDeal } from '@/lib/supabase/deals'
import { resolverProcesoDeCaptacion } from '@/lib/deals/proceso-manual'
import { armarDatosDifusionDesdeVisita } from '@/lib/portals/datos-visita'
import type { VisitDataSnapshot } from '@/types/visit-data.types'
import { canAccessDeal } from '@/lib/auth/entity-access'
import { ROLE_PERMISSIONS } from '@/lib/auth/roles'
import type { Role } from '@/types/auth.types'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function getStorageAdmin() {
  return getAdmin().storage
}

/**
 * ¿Puede este usuario mover ESE proceso a "Captada"? Antes lo hacía
 * `/api/deals/[id]/advance`, que pedía `pipeline.advance`. Al pasar el vínculo
 * a esta ruta (que solo pide estar logueado) hay que pedir lo mismo —si no, un
 * abogado movía procesos mandando un `deal_id`— y además acceso al proceso: un
 * asesor, solo los suyos.
 */
async function puedeMoverProceso(user: Awaited<ReturnType<typeof requireAuth>>, dealId: string): Promise<boolean> {
  const permisos = ROLE_PERMISSIONS[user.profile.role as Role] as string[] | undefined
  if (!permisos?.includes('pipeline.advance')) return false
  return canAccessDeal(user, dealId)
}

/** Una propiedad descartada no ocupa el lugar: esa tasación se puede volver a captar. */
function estaActiva(p: { status?: string | null; commercial_status?: string | null } | null | undefined): boolean {
  if (!p) return false
  return p.status !== 'descartada' && p.commercial_status !== 'descartada'
}

/**
 * Con qué proceso se vincula esta captación. Las reglas están en
 * `resolverProcesoDeCaptacion` (módulo puro y testeado); acá solo se leen los
 * datos que esas reglas necesitan.
 *
 * Dos caminos, porque hay dos formas de captar:
 *  - con el proceso ya elegido en la pantalla (`deal_id`);
 *  - desde la ficha de la tasación (`appraisal_id`), que es lo habitual: ahí el
 *    proceso se busca por la tasación y, si hay más de uno, no se adivina.
 */
async function resolverCaptacion(dealIdPedido: string | null, appraisalIdPedido: string | null) {
  // Sin nada que resolver no se abre conexión: un alta suelta (carga masiva,
  // script) no tiene por qué depender de que la base esté a mano.
  if (!dealIdPedido && !appraisalIdPedido) return resolverProcesoDeCaptacion({})
  const db = getAdmin()

  if (dealIdPedido) {
    const { data: deal } = await db.from('deals').select('property_id, visit_data').eq('id', dealIdPedido).maybeSingle()
    let activas: { id: string }[] = []
    const propertyId = (deal as { property_id?: string | null } | null)?.property_id
    if (propertyId) {
      const { data: prop } = await db
        .from('properties')
        .select('id, status, commercial_status')
        .eq('id', propertyId)
        .maybeSingle()
      if (estaActiva(prop as { status?: string; commercial_status?: string } | null)) {
        activas = [{ id: (prop as { id: string }).id }]
      }
    }
    return resolverProcesoDeCaptacion({ dealIdElegido: dealIdPedido, propiedadesActivasDelProceso: activas })
  }

  const { data: deals } = await db.from('deals').select('id, stage, property_id').eq('appraisal_id', appraisalIdPedido!)
  const procesos = (deals ?? []) as { id: string; stage?: string; property_id?: string | null }[]

  const { data: props } = await db
    .from('properties')
    .select('id, status, commercial_status')
    .eq('appraisal_id', appraisalIdPedido!)
    .neq('status', 'descartada')
  const candidatas = ((props ?? []) as { id: string; status?: string; commercial_status?: string }[]).filter(estaActiva)

  // Una propiedad puede colgar del proceso SIN tener `appraisal_id` (las 25 que
  // entraron por el CSV, o una vinculada a mano). Si el proceso ya apunta a
  // una, también frena: es el mismo duplicado por otro camino.
  const yaVistas = new Set(candidatas.map(p => p.id))
  const sueltas = procesos.map(d => d.property_id).filter((id): id is string => !!id && !yaVistas.has(id))
  if (sueltas.length > 0) {
    const { data: otras } = await db.from('properties').select('id, status, commercial_status').in('id', sueltas)
    for (const p of ((otras ?? []) as { id: string; status?: string; commercial_status?: string }[])) {
      if (estaActiva(p) && !yaVistas.has(p.id)) { yaVistas.add(p.id); candidatas.push(p) }
    }
  }

  return resolverProcesoDeCaptacion({
    procesosDeLaTasacion: procesos.map(d => ({ id: d.id, stage: d.stage ?? '' })),
    propiedadesActivasDelProceso: candidatas.map(p => ({ id: p.id })),
  })
}

/**
 * Lo que el asesor cargó en la visita (expensas, portales y landing) para que
 * la propiedad nazca con eso adentro. Se lee ACÁ y no en el navegador: quien
 * capta desde la ficha de la tasación no tiene el proceso a mano, y así el dato
 * no depende de por dónde se entró.
 */
async function heredarDatosDeVisita(dealId: string) {
  try {
    const { data } = await getAdmin().from('deals').select('visit_data').eq('id', dealId).maybeSingle()
    const snapshot = (data as { visit_data?: VisitDataSnapshot | null } | null)?.visit_data ?? null
    if (!snapshot) return null
    return armarDatosDifusionDesdeVisita(snapshot)
  } catch (e) {
    // Heredar es una comodidad, no un requisito: el alta no se cae por esto.
    console.error('[properties] no se pudo heredar lo cargado en la visita:', e)
    return null
  }
}

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

    // Las fotos heredadas de una tasación pueden venir INCRUSTADAS (base64):
    // el asistente de tasación las guarda así. Se sacan del INSERT, se suben a
    // Storage y recién ahí se guardan como URLs — en el mismo orden. Con una
    // de 4,4 MB adentro de `photos`, ML respondía 413 y Argenprop rechazaba
    // "Multimedia.Url" (2026-09-14). Necesita el id para armar el path, por
    // eso va después del insert y ANTES del auto-avance a captada.
    // Lo heredado de la VISITA (Secciones 08/09, 2026-09-14) se acota antes
    // del INSERT: termina en prefills de los wizards y en el prompt de la landing.
    if (body.portal_data !== undefined) {
      const pd = (body.portal_data && typeof body.portal_data === 'object' ? body.portal_data : {}) as { ml?: unknown; ap?: unknown }
      body.portal_data = { ml: sanearValoresAtributo(pd.ml), ap: sanearValoresAtributo(pd.ap) }
    }
    if (body.landing_answers !== undefined) body.landing_answers = sanearRespuestasLanding(body.landing_answers)
    if (body.expensas !== undefined) {
      const n = Number(body.expensas)
      body.expensas = Number.isFinite(n) && n > 0 ? n : null
    }

    // A QUÉ PROCESO PERTENECE ESTA CAPTACIÓN (2026-09-17).
    //
    // El vínculo se resuelve y se escribe ACÁ, en el servidor. Antes lo hacía
    // el navegador con un pedido aparte y solo si se entraba desde la ficha del
    // proceso: captando desde la tasación —que es lo habitual— el proceso
    // quedaba en "Tasación Entregada" para siempre y nada frenaba captar dos
    // veces la misma tasación.
    //
    // `deal_id` NO es una columna de `properties`: se saca del body antes del
    // INSERT o el alta falla.
    const dealIdPedido = typeof body.deal_id === 'string' && body.deal_id.trim() ? body.deal_id.trim() : null
    delete body.deal_id
    const appraisalIdPedido = typeof body.appraisal_id === 'string' && body.appraisal_id.trim() ? body.appraisal_id.trim() : null
    // El proceso lo eligió la pantalla: si no puede moverlo, no se crea nada.
    if (dealIdPedido && !(await puedeMoverProceso(user, dealIdPedido))) {
      return NextResponse.json({ error: 'No podés captar para un proceso que no tenés asignado.' }, { status: 403 })
    }
    const captacion = await resolverCaptacion(dealIdPedido, appraisalIdPedido)
    if (captacion.tipo === 'duplicado') {
      return NextResponse.json({
        error: 'Este proceso ya tiene una propiedad captada: te llevamos a esa ficha en vez de crear otra.',
        propertyId: captacion.propertyId,
      }, { status: 409 })
    }
    let dealId = captacion.tipo === 'proceso' ? captacion.dealId : null
    // Resuelto por la tasación: si ese proceso es de otro, la captación sigue
    // (antes, desde la tasación, nunca se movía el proceso) pero no se toca ni
    // se hereda nada de un proceso ajeno.
    let avisoSinAcceso: string | null = null
    if (dealId && !dealIdPedido && !(await puedeMoverProceso(user, dealId))) {
      dealId = null
      avisoSinAcceso = 'La propiedad se creó, pero el proceso de esa tasación no está a tu nombre: no se movió a "Captada". Avisá al coordinador.'
    }

    // Sin proceso NO se frena el alta (el plan proponía un 400, pero eso dejaría
    // sin poder captarse a las tasaciones viejas que nunca tuvieron proceso, y a
    // cualquier propiedad que llegue por otro camino). Se crea igual y se AVISA:
    // el problema queda a la vista en vez de descubrirse meses después.
    const avisoSinProceso = captacion.tipo === 'elegir'
      ? captacion.motivo === 'varios_procesos'
        ? 'La propiedad se creó, pero esa tasación tiene más de un proceso y no elegimos por vos. Vinculala desde el CRM.'
        : 'La propiedad se creó sin proceso en el CRM: no va a aparecer en el embudo. Vinculala desde el proceso del cliente.'
      : null

    // Lo cargado en la visita (expensas, portales y landing) se hereda del
    // proceso EN EL SERVIDOR: así también lo hereda quien capta desde la ficha
    // de la tasación, que no tiene el proceso a mano. Lo que manda la pantalla
    // gana sobre lo heredado.
    const heredado = dealId ? await heredarDatosDeVisita(dealId) : null
    if (heredado) {
      if (body.expensas === undefined && heredado.expensas != null) body.expensas = heredado.expensas
      const hayPortalData = Object.keys(heredado.portal_data.ml).length + Object.keys(heredado.portal_data.ap).length > 0
      if (body.portal_data === undefined && hayPortalData) body.portal_data = heredado.portal_data
      if (body.landing_answers === undefined && Object.keys(heredado.landing_answers).length > 0) {
        body.landing_answers = heredado.landing_answers
      }
    }

    const fotosDelAlta: unknown[] = Array.isArray(body.photos) ? body.photos : []
    const hayIncrustadas = fotosDelAlta.some(esFotoIncrustada)
    const payload = {
      ...body,
      ...ubicacionPatch,
      ...(hayIncrustadas ? { photos: fotosDelAlta.filter(f => typeof f === 'string' && !esFotoIncrustada(f)) } : {}),
      created_by: body.created_by ?? user.id,
      assigned_to: body.assigned_to,
    }
    const id = await createProperty(payload)

    // Vincular el proceso y pasarlo a "Captada". Si falla, la propiedad ya
    // existe: se avisa en la respuesta en vez de perder el alta entera.
    let avisoProceso: string | null = avisoSinAcceso ?? avisoSinProceso
    if (dealId) {
      try {
        await linkPropertyToDeal(dealId, id)
      } catch (e) {
        console.error('[properties] no se pudo vincular el proceso:', e)
        avisoProceso = 'La propiedad se creó, pero no se pudo mover su proceso a "Captada". Avisá al equipo.'
      }
    }

    if (hayIncrustadas) {
      try {
        const r = await materializarFotosIncrustadas(id, fotosDelAlta, subidorStorage(getStorageAdmin()))
        await updateProperty(id, { photos: r.photos })
        console.info('[properties] fotos incrustadas materializadas', { id, subidas: r.subidas, descartadas: r.descartadas })
      } catch (e) {
        // La propiedad ya existe con las fotos que sí eran enlaces; lo que no
        // se pudo subir se puede volver a cargar desde Multimedia.
        console.error('[properties] no se pudieron materializar las fotos incrustadas:', e)
      }
    }

    await geocodePropertyBestEffort(id) // best-effort, nunca lanza

    // N4: notificar coordinador+admins+dueños (y asesor como CC).
    // Si falla, escala a admins.
    await notifyWithEscalation(
      () => notifyPropertyCreated(id),
      { failedNotificationType: 'property_created', entityType: 'property', entityId: id },
    )

    // Si el alta ya trae fotos (import masivo, API), la propiedad nace captada.
    // Desde el 2026-09-14 el alta desde una tasación NO hereda las fotos de la
    // tasación (son capturas del informe, no del aviso: así entró la de Street
    // View que rompió ML y Argenprop), así que normalmente nace sin fotos y
    // avanza a captada al CONFIRMAR la primera subida en Multimedia.
    // Best-effort: la propiedad ya existe, un fallo acá no puede tirar el alta.
    try { await checkAndAdvanceProperty(id) } catch (e) { console.error('[properties] auto-avance al crear:', e) }

    return NextResponse.json({ success: true, id, ...(avisoProceso ? { avisoProceso } : {}) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
