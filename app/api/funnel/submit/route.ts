import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { crearContactoYDeal } from '@/lib/funnel/create-funnel-lead'
import { construirTrabajos } from '@/lib/funnel/jobs-logic'
import { SubmitSchema, resolverCanales } from '@/lib/funnel/submit-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/funnel/submit — la conversión de las dos landings pagas.
 *
 * ESTA RESPUESTA AFIRMA SOLO DOS COSAS: "te registramos" y "no sos duplicado".
 * Para eso alcanzan 5 viajes, TODOS a Postgres y NINGUNO a un tercero:
 *
 *   1. reservar        → rate-limit + dedup + alta de la fila, atómico   1 viaje
 *   2. buscar/crear contacto                                          1-2 viajes
 *   3. crear deal                                                        1 viaje
 *   4. cerrar la reserva y encolar los 5 avisos                          1 viaje
 *   5. responder
 *
 * POR QUÉ. Antes esto encadenaba 25 idas y vueltas esperadas una tras otra,
 * incluidas Resend, Mailchimp y Meta. El 2026-08-08 el POST a Resend colgó
 * 34,47 s, el request llegó a ~38 s y el gateway devolvió una página HTML de
 * error 504: la persona vio "algo salió mal" y se fue creyendo que no se había
 * registrado, aunque su lead ya estaba en el CRM. Además nunca llegó a la
 * página de gracias, así que la conversión no se le reportó a Meta — y los
 * adsets optimizan por CompleteRegistration.
 *
 * REGLA DURA: acá no entra ninguna llamada a un tercero. Nunca. Si hace falta un
 * aviso nuevo, es un `kind` nuevo en `funnel_lead_jobs`.
 */

const RATE_WINDOW_MS = 60_000
// OJO: el límite es por IP y el 87% del tráfico es MÓVIL. Las operadoras usan
// CGNAT: cientos de personas comparten la misma IP pública, así que un tope bajo
// rechaza gente legítima con "Demasiados envíos" (pasó en producción). El freno
// real contra duplicados es el dedup por email/teléfono de abajo, no esto.
const RATE_MAX = 20
const DEDUP_WINDOW_MS = 5 * 60_000

/**
 * Cuánto puede frenar duplicados una reserva que todavía NO terminó.
 *
 * ESTE NÚMERO NO SE ELIGE POR GUSTO, SE DESPEJA. La reserva se crea en su propia
 * transacción (`reservar_envio_embudo`), así que queda confirmada y visible ni
 * bien la RPC vuelve. Si el proceso muere después —la función se recicla, el
 * gateway corta, un deploy a mitad de request— el `catch` de más abajo NO corre,
 * el `delete` de la reserva tampoco, y queda una fila 'reserved' huérfana: sin
 * contacto, sin deal, sin avisos. Mientras esa fila siga contando como duplicado,
 * el reintento de la persona recibe `deduplicated:true` y aterriza en la página
 * de gracias SIN haberse registrado nunca. Lead pago perdido con confirmación
 * falsa (y sin Píxel: el cliente saltea el evento cuando viene `deduplicated`).
 *
 * Las dos cotas:
 *  - Piso: lo que tarda el alta normal (contacto + deal, ~0,5 s). 8 s deja 16x
 *    de margen, así que un doble clic legítimo sigue viendo "ya te registramos"
 *    en vez de crear dos deals.
 *  - Techo: la vida máxima de una función de este sitio (~10 s habituales, 26 s
 *    de gateway). NINGUNA reserva legítima puede tener más de eso. Todo lo que
 *    pase de ahí es ventana de falso positivo pura — y son justo los segundos en
 *    que la persona reintenta después de ver el error. Con los 60 s que había
 *    antes, ~50 s eran exactamente eso.
 */
const EN_VUELO_MS = 8_000

// El schema vive en `lib/funnel/submit-schema.ts` (puro, testeado con los casos
// EXACTOS que rechazaron leads reales el 2026-08-14). La regla completa está
// documentada ahí; el resumen: un metadato de tracking jamás voltea una
// conversión, y email/teléfono se degradan en vez de rechazar mientras quede
// un canal usable.

// Cliente admin sin tipar (igual que lib/supabase/deals.ts y tasks.ts): el tipo
// generado `Database` está incompleto (no incluye `funnel_lead_submissions`),
// así que tiparlo rompería el `.from(...)`. Seguimos la convención del repo.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip + (process.env.IP_HASH_SALT ?? 'inmodf-default-salt')).digest('hex')
}

function redirectFor(funnel: 'tasacion' | 'clase'): string {
  return funnel === 'tasacion' ? '/gracias-tasacion' : '/gracias-clase'
}

/**
 * Cada rechazo queda REGISTRADO con los datos de contacto que la persona tipeó.
 *
 * Existe porque el 2026-08-14 una clienta real no pudo registrarse y no quedó
 * NINGÚN rastro: la validación corría antes de cualquier escritura, así que
 * "revisar quiénes intentaron y fallaron" era imposible. Con esta tabla, un
 * lead rebotado se recupera a mano — se pagó por ese clic.
 *
 * Best-effort: si el INSERT falla, el rechazo sale igual (jamás convertir un
 * problema de log en un 500).
 */
async function registrarRechazo(
  supabase: ReturnType<typeof admin>,
  datos: {
    funnel: string | null
    name: string | null
    email: string | null
    phone: string | null
    motivo: string
    detalle: unknown
    ipHash: string
    userAgent: string | null
  },
): Promise<void> {
  try {
    // Techo por IP: este INSERT corre ANTES del rate-limit de la reserva (el
    // rechazo corta antes de llegar ahí), así que sin esto un bot escribiría
    // sin cota. Una persona real rebota 1-2 veces; 5 por hora sobra.
    const { count } = await supabase
      .from('funnel_submit_rejections')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', datos.ipHash)
      .gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
    if ((count ?? 0) >= 5) {
      console.warn('[funnel/submit] rechazo NO registrado (techo por IP)', { ipHash: datos.ipHash })
      return
    }

    // OJO: supabase-js NO lanza ante un error de Postgres — resuelve con
    // { error }. Sin leerlo, esta red de seguridad fallaría en silencio total
    // (justo el agujero que vino a tapar).
    const { error } = await supabase.from('funnel_submit_rejections').insert({
      funnel: datos.funnel,
      name: datos.name,
      email: datos.email,
      phone: datos.phone,
      motivo: datos.motivo,
      detalle: (datos.detalle ?? null) as never,
      ip_hash: datos.ipHash,
      user_agent: datos.userAgent,
    })
    if (error) console.error('[funnel/submit] no se pudo registrar el rechazo', error.message)
  } catch (e) {
    console.error('[funnel/submit] no se pudo registrar el rechazo', e)
  }
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const ipHash = hashIp(ip)
  const userAgent = req.headers.get('user-agent')
  const supabase = admin()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    // Sin body no hay contacto que recuperar: solo un log (un bot con JSON roto
    // no merece una fila en la tabla de rechazos).
    console.warn('[funnel/submit] JSON inválido', { ipHash })
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = SubmitSchema.safeParse(body)
  if (!parsed.success) {
    // Con el schema nuevo esto es casi imposible para un humano (solo nombre
    // vacío o funnel desconocido) — si pasa, que quede TODO lo tipeado.
    // Solo se registra si hay ALGO de contacto que recuperar: una fila sin
    // nombre ni email ni teléfono es un bot, y para eso está el log.
    const crudo = (body ?? {}) as Record<string, unknown>
    const s = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null)
    const datos = {
      funnel: s(crudo.funnel, 40),
      name: s(crudo.name, 200),
      email: s(crudo.email, 200),
      phone: s(crudo.phone, 60),
    }
    if (datos.name || datos.email || datos.phone) {
      await registrarRechazo(supabase, {
        ...datos, motivo: 'schema', detalle: parsed.error.flatten(), ipHash, userAgent,
      })
    }
    return NextResponse.json({ error: 'Datos inválidos', detail: parsed.error.flatten() }, { status: 400 })
  }
  const d = parsed.data

  // Honeypot: si viene relleno, fingimos éxito sin crear nada.
  if (d.company && d.company.trim().length > 0) {
    return NextResponse.json({ ok: true, redirect: redirectFor(d.funnel) })
  }

  // Canales de contacto: degradar antes que rechazar (la tabla de verdad está
  // en `resolverCanales`). Solo rebota quien no dejó NINGÚN canal usable.
  const canales = resolverCanales(d.email, d.phone)
  if (!canales.ok) {
    await registrarRechazo(supabase, {
      funnel: d.funnel, name: d.name, email: d.email, phone: d.phone,
      motivo: 'sin_canal_usable', detalle: canales.descartado, ipHash, userAgent,
    })
    return NextResponse.json(
      { error: 'Revisá el email o el teléfono: necesitamos al menos uno para contactarte.' },
      { status: 400 },
    )
  }
  if (canales.descartado.email || canales.descartado.phone) {
    // El lead entra igual, y lo descartado va a la nota del deal: un humano
    // puede darse cuenta de que "juan..perez@gmail.com" era juan.perez.
    const aviso = [
      canales.descartado.email ? `Email tipeado (no válido): ${canales.descartado.email}` : null,
      canales.descartado.phone ? `Teléfono tipeado (no válido): ${canales.descartado.phone}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    d.message = d.message ? `${d.message}\n\n${aviso}` : aviso
    console.warn('[funnel/submit] canal degradado', canales.descartado)
  }
  d.email = canales.email
  d.phone = canales.phone

  // --- 1) Reserva ATÓMICA: rate-limit por IP + dedup por email/teléfono + alta
  // de la fila del envío, todo en una sola operación serializada en Postgres.
  //
  // La comprobación NO puede hacerse acá con dos consultas: dos POST simultáneos
  // del mismo teléfono no ven la fila todavía sin confirmar del otro, los dos
  // creen que no hay duplicado y crean DOS deals. Por eso la decisión entera
  // vive en `reservar_envio_embudo` (ver la migración 20260808000001).
  const { data: reserva, error: errorReserva } = await supabase.rpc('reservar_envio_embudo', {
    p_funnel: d.funnel,
    p_ip_hash: ipHash,
    p_email: d.email ?? null,
    p_phone: d.phone ?? null,
    p_event_id: d.eventId ?? null,
    p_rate_max: RATE_MAX,
    p_rate_window_seconds: RATE_WINDOW_MS / 1000,
    p_dedup_window_seconds: DEDUP_WINDOW_MS / 1000,
    p_inflight_seconds: EN_VUELO_MS / 1000,
  })
  if (errorReserva) {
    console.error('[funnel/submit] reservar_envio_embudo falló', errorReserva)
    return NextResponse.json({ error: 'No pudimos procesar tu envío. Probá de nuevo.' }, { status: 500 })
  }

  const fila = (Array.isArray(reserva) ? reserva[0] : reserva) as
    | { resultado?: string; submission_id?: string | null; contact_id?: string | null }
    | null
    | undefined

  if (fila?.resultado === 'rate_limited') {
    return NextResponse.json({ error: 'Demasiados envíos. Probá de nuevo en un minuto.' }, { status: 429 })
  }
  if (fila?.resultado === 'duplicado') {
    // Ya está registrado → devolvemos su contactId para marcar 'registrado' en
    // el mapa de calor. (Si el duplicado es un envío que todavía está EN VUELO,
    // el contactId viene null: la fila existe pero el contacto aún no. Eso solo
    // puede pasar dentro de `EN_VUELO_MS`, o sea contra un envío que arrancó
    // hace segundos y casi con certeza va a terminar bien — el doble clic. Una
    // reserva abandonada deja de contar como duplicado apenas pasa esa ventana;
    // ver el comentario de la constante, ahí está el porqué del número.)
    return NextResponse.json({
      ok: true,
      deduplicated: true,
      contactId: fila.contact_id ?? null,
      redirect: redirectFor(d.funnel),
    })
  }
  if (fila?.resultado !== 'reservado' || !fila.submission_id) {
    console.error('[funnel/submit] respuesta inesperada de reservar_envio_embudo', reserva)
    return NextResponse.json({ error: 'No pudimos procesar tu envío. Probá de nuevo.' }, { status: 500 })
  }
  const submissionId = fila.submission_id

  // --- 2 y 3) Contacto + deal. Es TODO lo que se crea mientras la persona espera.
  let result: { contactId: string; dealId: string }
  try {
    result = await crearContactoYDeal({
      funnel: d.funnel,
      name: d.name,
      email: d.email ?? null,
      phone: d.phone ?? null,
      propertyLocation: d.propertyLocation ?? null,
      tipoCliente: d.tipoCliente ?? null,
      message: d.message ?? null,
      attribution: d.attribution ?? null,
    })
  } catch (e) {
    console.error('[funnel/submit] crearContactoYDeal falló', e)
    // Soltar la reserva: si queda, el reintento de la persona rebota como
    // "duplicado" y se va a la página de gracias sin haberse registrado nunca.
    try {
      await supabase.from('funnel_lead_submissions').delete().eq('id', submissionId)
    } catch (e2) {
      console.warn('[funnel/submit] no se pudo soltar la reserva', e2)
    }
    return NextResponse.json({ error: 'No pudimos procesar tu envío. Probá de nuevo.' }, { status: 500 })
  }

  // --- 4) Cerrar la reserva y encolar los cinco avisos, en un solo viaje.
  // AMBOS embudos disparan CompleteRegistration: las campañas Meta optimizan por
  // COMPLETE_REGISTRATION (promoted_object de los adsets activos). Cambiarlo
  // desalinearía el conteo de resultados en Ads Manager — decisión 2026-07-17.
  const trabajos = construirTrabajos({
    funnel: d.funnel,
    contactId: result.contactId,
    dealId: result.dealId,
    nombre: d.name,
    email: d.email ?? null,
    phone: d.phone ?? null,
    propertyLocation: d.propertyLocation ?? null,
    anonId: d.anonId ?? null,
    eventId: d.eventId ?? null,
    eventSourceUrl:
      d.eventSourceUrl ??
      `${process.env.NEXT_PUBLIC_FUNNEL_PUBLIC_URL ?? 'https://inmobiliariadiegoferreyra.com'}/${d.funnel === 'clase' ? 'vsl-clase-propietarios' : 'tasacion-directa'}`,
    // La hora REAL de la conversión viaja con el trabajo: el evento se manda
    // después y sin esto Meta registraría la hora del worker.
    eventTimeUnixSeconds: Math.floor(Date.now() / 1000),
    fbp: d.fbp ?? null,
    fbc: d.fbc ?? null,
    ip: ip === 'unknown' ? null : ip,
    userAgent: req.headers.get('user-agent'),
  })

  const cerrar = () =>
    supabase.rpc('completar_envio_embudo', {
      p_submission_id: submissionId,
      p_contact_id: result.contactId,
      p_deal_id: result.dealId,
      p_trabajos: trabajos,
    })

  let { error: errorCierre } = await cerrar()
  if (errorCierre) {
    // Un solo reintento: la llamada es idempotente (UPDATE + ON CONFLICT DO
    // NOTHING), así que repetirla no duplica avisos. Es la misma base que acaba
    // de aceptar tres escrituras, un fallo acá es casi siempre un hipo de red.
    ;({ error: errorCierre } = await cerrar())
  }
  if (errorCierre) {
    // El lead YA está en el CRM y la persona SÍ se registró: responder 500 la
    // haría creer lo contrario y reenviar. Se responde ok y queda el grito en
    // los logs — el envío queda en 'reserved' (no cuenta como conversión) y
    // nadie recibe los avisos de ESTE lead.
    console.error(
      '[funnel/submit] NO SE PUDIERON ENCOLAR LOS AVISOS — lead sin notificar',
      { submissionId, dealId: result.dealId, contactId: result.contactId, error: errorCierre.message },
    )
  }

  return NextResponse.json({ ok: true, contactId: result.contactId, redirect: redirectFor(d.funnel) })
}
