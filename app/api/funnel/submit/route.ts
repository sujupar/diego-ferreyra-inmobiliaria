import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { crearContactoYDeal } from '@/lib/funnel/create-funnel-lead'
import { construirTrabajos } from '@/lib/funnel/jobs-logic'

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
const RATE_MAX = 5
const DEDUP_WINDOW_MS = 5 * 60_000

/**
 * Cuánto puede frenar duplicados una reserva que todavía no terminó. Es un techo
 * generoso para lo que tarda el alta (contacto + deal, ~0,5 s) y a la vez corto:
 * si el proceso muere entre la reserva y el alta, la persona puede volver a
 * intentar enseguida en vez de comerse un "ya estás registrado" falso por 5 min.
 */
const EN_VUELO_MS = 60_000

const Schema = z
  .object({
    funnel: z.enum(['tasacion', 'clase']),
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(200).nullable().optional(),
    phone: z.string().trim().min(6).max(30).nullable().optional(),
    propertyLocation: z.string().trim().max(200).nullable().optional(),
    tipoCliente: z.string().trim().max(100).nullable().optional(),
    message: z.string().trim().max(2000).nullable().optional(),
    company: z.string().max(200).optional(), // honeypot
    eventId: z.string().min(8).max(128).optional(),
    eventSourceUrl: z.string().url().max(500).nullable().optional(),
    fbp: z.string().max(200).nullable().optional(),
    fbc: z.string().max(300).nullable().optional(),
    anonId: z.string().min(8).max(64).nullable().optional(), // sesión anónima de video → stitching
    attribution: z
      .object({
        utm_source: z.string().max(200).nullable().optional(),
        utm_medium: z.string().max(200).nullable().optional(),
        utm_campaign: z.string().max(200).nullable().optional(),
        utm_content: z.string().max(200).nullable().optional(),
        utm_term: z.string().max(200).nullable().optional(),
        fb_campaign_id: z.string().max(200).nullable().optional(),
        fb_adset_id: z.string().max(200).nullable().optional(),
        fb_ad_id: z.string().max(200).nullable().optional(),
        fb_placement: z.string().max(200).nullable().optional(),
      })
      .partial()
      .nullable()
      .optional(),
  })
  .refine((d) => !!(d.email || d.phone), { message: 'Se requiere email o teléfono.' })

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

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detail: parsed.error.flatten() }, { status: 400 })
  }
  const d = parsed.data

  // Honeypot: si viene relleno, fingimos éxito sin crear nada.
  if (d.company && d.company.trim().length > 0) {
    return NextResponse.json({ ok: true, redirect: redirectFor(d.funnel) })
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const ipHash = hashIp(ip)
  const supabase = admin()

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
    // el mapa de calor. (Si el duplicado es un envío que todavía está en vuelo,
    // el contactId viene null: la fila existe pero el contacto aún no.)
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
