import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { getUser } from '@/lib/auth/get-user'
import { puedeEditarTasacion, puedeVerTasaciones } from '@/lib/auth/appraisal-access'
import { insertAppraisalWithComparables } from '@/lib/supabase/appraisals-write'
import type { SaveAppraisalInput } from '@/lib/supabase/appraisals'
import { currentPeriod } from '@/lib/market-data/period'
import { inicioDelDiaArgentina, finDelDiaArgentina } from '@/lib/filters/rango-fechas'
import { clausulasBusqueda } from '@/lib/filters/busqueda-texto'
import { parsearPrecio } from '@/lib/filters/rango-precio'

/**
 * Columnas de texto donde busca el buscador del Historial de Tasaciones.
 *
 * `notes` hoy está vacío en las 41 tasaciones (verificado contra la base), pero
 * se incluye igual: no cuesta nada y el día que el equipo lo use, el buscador
 * ya lo mira.
 */
const COLUMNAS_BUSQUEDA = ['property_title', 'property_location', 'property_description', 'notes'] as const

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * D29: el orden se resuelve ACÁ, no en memoria sobre la página cargada.
 * La pantalla pagina de a 12; ordenar del lado del navegador ordenaba esas 12
 * filas y dejaba la flecha del encabezado puesta como si el orden fuera de
 * todas las tasaciones — "la más cara" era la más cara de la página.
 *
 * Lista blanca: la clave llega del querystring y termina dentro de un
 * `.order()`. Cualquier clave que no esté acá se ignora y se usa el orden por
 * defecto (las más nuevas primero), que es el que la pantalla espera al abrir.
 * Son exactamente las columnas marcadas `sortable` en la tabla.
 */
const COLUMNAS_ORDENABLES = new Set([
  'property_title',
  'property_location',
  'publication_price',
  'comparable_count',
  'created_at',
])

export async function GET(request: NextRequest) {
  try {
    // Usuario EFECTIVO (impersonation-aware: si un admin está "viendo como" un asesor,
    // me.id es el del asesor). El scope del asesor se decide acá en el server, no en el
    // cliente — así no se puede falsear el query param para ver tasaciones ajenas.
    const me = await getUser()
    if (!me) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // D1: el abogado NO tiene permisos de tasación (roles.ts solo le da
    // properties.view_all + properties.review) y sin embargo recibía el
    // listado COMPLETO de la inmobiliaria, con el que después borraba.
    // Ver lib/auth/appraisal-access.ts.
    //
    // El candado pregunta por el LISTADO, no por "¿alcanza algo?": desde que el
    // abogado puede leer la tasación de la propiedad que revisa (alcance
    // `vinculadas`), un `!== 'ninguna'` acá le devolvería las 34 de la
    // inmobiliaria — justo lo que este 403 vino a cerrar.
    if (!puedeVerTasaciones(me.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const assignedTo = searchParams.get('assigned_to')
    const sort = searchParams.get('sort')
    const dir = searchParams.get('dir')
    const ordenPedido = sort && COLUMNAS_ORDENABLES.has(sort) ? sort : null
    const columnaOrden = ordenPedido || 'created_at'
    const ascendente = ordenPedido ? dir === 'asc' : false

    // Buscador de texto y rango de precio. Los tres son OPCIONALES: sin ellos
    // la consulta queda exactamente igual que antes de que existiera el buscador.
    const q = searchParams.get('q') || ''
    const precioMin = parsearPrecio(searchParams.get('min'))
    const precioMax = parsearPrecio(searchParams.get('max'))

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const rangeFrom = (page - 1) * limit
    const rangeTo = rangeFrom + limit - 1

    let query = supabase
      .from('appraisals')
      .select(
        'id, property_title, property_location, publication_price, currency, comparable_count, created_at, origin, assigned_to',
        { count: 'exact' }
      )
      .order(columnaOrden, { ascending: ascendente })
      // Desempate estable: sin él, dos filas con el mismo precio (o la misma
      // fecha) pueden salir en orden distinto en cada pedido y una tasación
      // aparece dos veces al pasar de página, o no aparece nunca.
      .order('id', { ascending: true })

    // Día ARGENTINO, no UTC — ver lib/filters/rango-fechas.ts.
    if (from) query = query.gte('created_at', inicioDelDiaArgentina(from))
    if (to) query = query.lte('created_at', finDelDiaArgentina(to))

    // UNA condición por palabra: cada palabra tiene que aparecer en alguna de
    // las columnas, y todas las palabras tienen que aparecer. Varios `.or()`
    // sobre la misma consulta se combinan con Y — `.or()` hace `append`, no
    // pisa (verificado en el código de postgrest-js y contra la API real).
    for (const clausula of clausulasBusqueda(COLUMNAS_BUSQUEDA, q)) {
      query = query.or(clausula)
    }

    // Precio. El rango se compara contra el número guardado, así que solo tiene
    // sentido sobre fichas en la MISMA moneda: hoy las 41 están en dólares.
    // El nulo cuenta como dólar porque así lo muestra la pantalla
    // (`currency || 'USD'`); si la consulta lo excluyera, el listado y el
    // filtro estarían diciendo cosas distintas sobre la misma ficha.
    if (precioMin !== null) query = query.gte('publication_price', precioMin)
    if (precioMax !== null) query = query.lte('publication_price', precioMax)
    if (precioMin !== null || precioMax !== null) {
      query = query.or('currency.eq.USD,currency.is.null')
    }

    // El asesor SOLO ve sus tasaciones: las que creó (user_id) O las que tiene asignadas
    // (assigned_to). Antes filtraba solo por assigned_to → si la tasación no se asignaba
    // explícitamente, no aparecía (mostraba 0). Coordinador/admin ven todo (o filtrado).
    if (me.profile.role === 'asesor') {
      query = query.or(`assigned_to.eq.${me.id},user_id.eq.${me.id}`)
    } else if (assignedTo) {
      query = query.eq('assigned_to', assignedTo)
    }

    const { data, error, count } = await query.range(rangeFrom, rangeTo)

    if (error) throw error

    return NextResponse.json({ data: data || [], count: count || 0 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

/**
 * Crea una tasación de forma confiable: SERVER-SIDE con service role (bypassa
 * RLS), inserción atómica (cleanup compensatorio si falla un comparable) y, si
 * viene `dealId`, vincula la tasación al proceso en la misma request.
 *
 * Reemplaza el guardado client-side (browser client + RLS) que fallaba en
 * silencio y no persistía. Cualquier error se devuelve con código HTTP y
 * detalle real (code/detail/hint), y se loguea server-side (Netlify logs).
 */
export async function POST(request: NextRequest) {
  // requireAuth() puede llamar redirect() (throw NEXT_REDIRECT). Va FUERA del
  // try para que el redirect propague a Next.js en vez de convertirse en 500.
  const user = await requireAuth()
  try {
    // D1, misma puerta que el GET: un rol que no ESCRIBE tasaciones tampoco las
    // crea. Antes acá solo había `requireAuth()`, o sea que el abogado podía
    // insertar tasaciones además de leerlas y borrarlas; y con `!== 'ninguna'`
    // volvería a poder, porque su alcance ya no es `ninguna` sino `vinculadas`.
    if (!puedeEditarTasacion(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const input = (await request.json()) as SaveAppraisalInput & { dealId?: string }

    // Validaciones mínimas — el subject y un valuationResult válido son NOT NULL en DB.
    if (!input?.subject || !input?.valuationResult) {
      return NextResponse.json({ error: 'Faltan datos: subject y valuationResult son requeridos' }, { status: 400 })
    }
    if (!Array.isArray(input.comparables)) {
      return NextResponse.json({ error: 'comparables debe ser un array' }, { status: 400 })
    }

    // Atribuir la tasación al usuario autenticado (el browser no manda userId).
    // Mejora la trazabilidad y la visibilidad por RLS (user_id = auth.uid()).
    if (!input.userId) input.userId = user.id

    // Si un ASESOR crea la tasación y no eligió asignado, se la asignamos a él mismo
    // (user vía requireAuth → impersonation-aware). Así aparece en SU historial y su
    // foto sale en el informe (la foto del asesor se resuelve por assigned_to).
    if (!input.assignedTo && user.profile.role === 'asesor') input.assignedTo = user.id

    // Congelar el período de datos de mercado al mes de creación (server-authoritative).
    if (!input.marketPeriod) input.marketPeriod = currentPeriod()

    const supabase = getAdmin()
    const appraisalId = await insertAppraisalWithComparables(supabase, input)

    // Vínculo con el proceso (deal) — best-effort, pero ahora con service role
    // (confiable) y logueado. NO bloquea el éxito del guardado de la tasación:
    // la tasación ya quedó persistida en el historial.
    let linkWarning: string | null = null
    if (input.dealId) {
      const { error: linkError } = await supabase
        .from('deals')
        .update({ appraisal_id: appraisalId, updated_at: new Date().toISOString() })
        .eq('id', input.dealId)
      if (linkError) {
        linkWarning = linkError.message
        console.error('[POST /api/appraisals] link-to-deal failed', { dealId: input.dealId, appraisalId, error: linkError })
      }
    }

    return NextResponse.json({ id: appraisalId, linkWarning })
  } catch (error) {
    const e = error as { message?: string; code?: string; details?: string; hint?: string }
    console.error('[POST /api/appraisals] save failed', { message: e?.message, code: e?.code, details: e?.details, hint: e?.hint, raw: error })
    return NextResponse.json(
      { error: e?.message || 'Error al guardar la tasación', code: e?.code, detail: e?.details, hint: e?.hint },
      { status: 500 },
    )
  }
}
