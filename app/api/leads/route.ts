import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { createAccessToken, accessUrl } from '@/lib/leads/access-token'
import { sendRecorridoWhatsapp } from '@/lib/leads/send-recorrido-whatsapp'
import { resolveDeliverMedia } from '@/lib/properties/deliver-media'
import { evaluateLeadSubmission } from '@/lib/leads/anti-bot'
import type { Database } from '@/types/database.types'

// El POST espera, dentro del request: el email del recorrido, el envío por
// WhatsApp (timeout 3s) y Meta CAPI (timeout 3s). Sin `maxDuration` explícito
// la función se corta al default de la plataforma y el lead podría quedar sin
// respuesta al visitante.
export const maxDuration = 26

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * `property_leads.deleted_at` (papelera, migración 20260730000001) todavía no
 * está en `types/database.types.ts` — el CLI de Supabase no conecta en este
 * proyecto (ver CLAUDE.md § Supabase), así que los types no se pueden
 * regenerar. Mismo patrón que `lib/integrations/whatsapp/log.ts`: cliente SIN
 * el genérico `<Database>` para cualquier query que toque esa columna.
 */
function getAdminRaw() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const OPS_ROLES = ['admin', 'dueno', 'coordinador'] as const

/**
 * GET /api/leads?status=X&propertyId=Y&source=Z&days=N&assignedTo=me
 * Lista leads filtrados según RLS por rol.
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const role = user.profile.role
    if (!['admin', 'dueno', 'coordinador', 'asesor'].includes(role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const propertyId = url.searchParams.get('propertyId')
    const source = url.searchParams.get('source')
    const days = parseInt(url.searchParams.get('days') ?? '30', 10)
    const assignedToMe = url.searchParams.get('assignedTo') === 'me'
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500)
    // Papelera: solo roles de operaciones pueden pedir los leads borrados.
    const trashed = url.searchParams.get('trashed') === 'true'
    if (trashed && !OPS_ROLES.includes(role as (typeof OPS_ROLES)[number])) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // `deleted_at` no está en el Database type generado (ver getAdminRaw arriba)
    // — esta ruta necesita filtrar por esa columna en ambos casos (papelera y
    // listado normal), así que usa el cliente sin el genérico para toda la query.
    const supabase = getAdminRaw()

    // Asesor: ver leads de sus propiedades O asignados directamente a él.
    // El RLS de property_leads ya tiene este criterio, pero como usamos
    // getAdmin() bypasseamos RLS y replicamos la lógica acá.
    let asesorPropertyIds: string[] | null = null
    if (role === 'asesor') {
      const { data: props } = await supabase
        .from('properties')
        .select('id')
        .eq('assigned_to', user.id)
      asesorPropertyIds = (props ?? []).map(p => p.id)
    }

    let query = supabase
      .from('property_leads')
      // `lead_number` = el # visible de comprador; `suspected_bot`/`bot_reason` lo
      // marcan sin descartarlo. Ninguna de las tres está en el Database type
      // generado (el CLI de Supabase no conecta en este proyecto) → cast abajo.
      .select('id, property_id, name, email, phone, message, source, status, assigned_to, notes, created_at, deleted_at, lead_number, suspected_bot, bot_reason')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit)

    query = trashed ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null)

    if (status) query = query.eq('status', status)
    if (propertyId) query = query.eq('property_id', propertyId)
    if (source) query = query.eq('source', source)

    if (role === 'asesor') {
      // OR de: lead.assigned_to = user.id  OR  property_id IN [sus propiedades]
      if (asesorPropertyIds && asesorPropertyIds.length > 0) {
        const propsList = asesorPropertyIds.map(id => `property_id.eq.${id}`).join(',')
        query = query.or(`assigned_to.eq.${user.id},${propsList}`)
      } else {
        // No tiene propiedades asignadas → solo los leads asignados directos
        query = query.eq('assigned_to', user.id)
      }
    } else if (assignedToMe) {
      query = query.eq('assigned_to', user.id)
    }

    const { data: leads, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Hidratar con info básica de la propiedad
    const propIds = Array.from(new Set((leads ?? []).map(l => l.property_id)))
    let propsMap: Map<string, { address: string; title: string | null; neighborhood: string | null; assigned_to: string | null }> = new Map()
    if (propIds.length > 0) {
      const { data: props } = await supabase
        .from('properties')
        .select('id, address, title, neighborhood, assigned_to')
        .in('id', propIds)
      propsMap = new Map((props ?? []).map(p => [p.id, p]))
    }

    const enriched = (leads ?? []).map(l => ({
      ...l,
      properties: propsMap.get(l.property_id) ?? null,
    }))

    return NextResponse.json({ data: enriched })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

const LeadSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().min(6).max(30).nullable().optional(),
  message: z.string().trim().max(2000).nullable().optional(),
  source: z
    .enum([
      'landing',
      'meta_form',
      'portal_mercadolibre',
      'portal_argenprop',
      'portal_zonaprop',
    ])
    .default('landing'),
  utm: z.record(z.string(), z.string()).optional().default({}),
  // Campos opcionales para Meta CAPI deduplication (vienen del LeadForm)
  eventId: z.string().min(8).max(128).optional(),
  fbp: z.string().max(200).nullable().optional(),
  fbc: z.string().max(300).nullable().optional(),
  eventSourceUrl: z.string().url().nullable().optional(),
  // Task 6 — ficha de un solo uso (`GET /api/leads/ticket`). Puede venir
  // ausente/null: el popup NUNCA bloquea el envío por esto, solo se pierde la
  // señal y el lead queda marcado `sospechoso` (ver `evaluateLeadSubmission`).
  ticket: z.string().max(200).nullable().optional(),
})

// Rate limit best-effort por IP (no sobrevive entre instancias serverless).
// La defensa real contra spam la da isDuplicate() en DB.
const SIMPLE_RATE: Map<string, number[]> = new Map()
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 5

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (SIMPLE_RATE.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  if (hits.length >= RATE_MAX) return true
  hits.push(now)
  SIMPLE_RATE.set(ip, hits)
  return false
}

/**
 * Defensa contra spam de leads: chequea si el mismo (email OR phone) ya
 * envió a esta propiedad en los últimos 5 minutos. Funciona entre instancias
 * serverless (a diferencia del rate limit in-memory).
 *
 * Usa dos queries separadas con .eq() en lugar de .or() con strings
 * interpolados, para evitar inyección de sintaxis PostgREST si email/phone
 * traen comas, puntos u operadores reservados.
 */
async function isDuplicate(
  supabase: ReturnType<typeof getAdmin>,
  propertyId: string,
  email: string | null,
  phone: string | null,
): Promise<boolean> {
  if (!email && !phone) return false
  const since = new Date(Date.now() - 5 * 60_000).toISOString()

  if (email) {
    // `.from(...) as any`: `deleted_at` no está en el Database type generado
    // (ver comentario de `getAdminRaw` más arriba). Un lead borrado no debe
    // bloquear un reenvío legítimo por "duplicado".
    const { count } = await (supabase.from('property_leads') as any)
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .eq('email', email)
      .gte('created_at', since)
      .is('deleted_at', null)
    if ((count ?? 0) > 0) return true
  }

  if (phone) {
    const { count } = await (supabase.from('property_leads') as any)
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .eq('phone', phone)
      .gte('created_at', since)
      .is('deleted_at', null)
    if ((count ?? 0) > 0) return true
  }

  return false
}

export async function POST(req: Request) {
  try {
    // Rate limit best-effort por IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Demasiados envíos en poco tiempo. Probá de nuevo en un minuto.' },
        { status: 429 },
      )
    }

    const body = await req.json()
    const parsed = LeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', detail: parsed.error.flatten() },
        { status: 400 },
      )
    }

    // Al menos uno de email o teléfono
    if (!parsed.data.email && !parsed.data.phone) {
      return NextResponse.json(
        { error: 'Es necesario al menos un email o teléfono' },
        { status: 400 },
      )
    }

    const supabase = getAdmin()
    const { data: prop, error: propErr } = await supabase
      .from('properties')
      .select('id, address, title, neighborhood, assigned_to, status, photos, asking_price, currency, video_recorrido_url, tour_3d_url')
      .eq('id', parsed.data.propertyId)
      .single()
    if (propErr || !prop) {
      return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 })
    }
    if (prop.status !== 'approved') {
      return NextResponse.json(
        { error: 'Esta propiedad no está disponible para consultas' },
        { status: 410 },
      )
    }

    // Dedup: mismo (email OR phone) en los últimos 5 min para la misma property
    if (await isDuplicate(supabase, prop.id, parsed.data.email ?? null, parsed.data.phone ?? null)) {
      return NextResponse.json({
        ok: true,
        deduplicated: true,
        message: 'Ya recibimos tu consulta hace unos minutos. Te vamos a contactar a la brevedad.',
      })
    }

    // Ojo: NO rechazamos leads con teléfono inservible para WhatsApp (un lead
    // con email sigue sirviendo). `phone` guarda el string tal cual lo tipeó
    // el visitante (nunca lo pisamos con el E.164) — no hay columna para el
    // normalizado y no corresponde agregar una migración solo para esto; el
    // Inbox (`InboxClient.tsx`) llama `isWhatsappUsable(lead.phone)` al leer
    // para mostrar la insignia "Teléfono no válido para WhatsApp".

    // Task 6 — anti-bot: NUNCA rechaza, solo marca. Ver `lib/leads/anti-bot.ts`.
    const antiBot = evaluateLeadSubmission({
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      ticket: parsed.data.ticket ?? null,
    })
    if (antiBot.suspectedBot) {
      console.warn(`[leads] posible bot (se guarda igual): ${antiBot.reason}`)
    }

    // `suspected_bot`/`bot_reason` no están en el Database type generado
    // (migración muy reciente, mismo motivo que `deleted_at` — ver
    // `getAdminRaw` arriba): este INSERT puntual usa el cliente sin el
    // genérico para poder escribirlas.
    const { data: lead, error: insErr } = await getAdminRaw()
      .from('property_leads')
      .insert({
        property_id: parsed.data.propertyId,
        name: parsed.data.name,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        message: parsed.data.message ?? null,
        source: parsed.data.source,
        utm: parsed.data.utm,
        assigned_to: prop.assigned_to,
        suspected_bot: antiBot.suspectedBot,
        bot_reason: antiBot.reason,
      })
      .select()
      .single()
    if (insErr || !lead) {
      return NextResponse.json(
        { error: insErr?.message ?? 'No pudimos guardar la consulta' },
        { status: 500 },
      )
    }

    // Token de acceso al recorrido: congela los datos de esta persona para que
    // después pueda ver la propiedad por dentro y agendar SIN volver a cargarlos.
    // Best-effort: si falla, el lead ya está guardado y el flujo sigue.
    const token = await createAccessToken({
      propertyId: prop.id,
      leadId: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
    })

    // ¿La propiedad tiene de verdad un recorrido para entregar? Publicar exige
    // uno (`assertRecorridoDisponible`), pero el asesor puede borrarlo DESPUÉS y
    // la landing sigue viva. Sin recorrido no le prometemos uno a nadie: el link
    // se entrega igual (lleva a las fotos y a la agenda) pero con el texto que
    // corresponde, y no se manda el WhatsApp — su plantilla es fija en Meta y
    // dice "acceso al recorrido".
    const hayRecorrido = resolveDeliverMedia(prop).kind !== 'fotos'

    // Copia durable del link por EMAIL. La pantalla de gracias se pierde si la
    // persona cierra el popup, así que el mail es la entrega que queda.
    // Best-effort: nunca lanza.
    if (token && lead.email) {
      const { sendRecorridoLinkToClient } = await import('@/lib/email/notifications/recorrido-link-client')
      await sendRecorridoLinkToClient({
        to: lead.email,
        clientName: lead.name,
        propertyLabel: prop.title ?? prop.address,
        accessUrl: accessUrl(token),
        hasRecorrido: hayRecorrido,
      })
    }

    // Envío del recorrido por WhatsApp (plantilla de utilidad). Best-effort:
    // devuelve true SOLO si Meta confirmó el envío real (no test mode, no
    // skipped) — ese booleano es el que va en la respuesta como `whatsappSent`.
    let whatsappSent = false
    if (token && hayRecorrido) {
      whatsappSent = await sendRecorridoWhatsapp({
        phone: lead.phone,
        clientName: lead.name,
        propertyLabel: prop.title ?? prop.address,
        token,
        leadId: lead.id,
        propertyId: prop.id,
      })
    }

    // Disparar email + WhatsApp al asesor fire-and-forget (no bloqueamos)
    if (prop.assigned_to) {
      notifyAdvisorAsync({
        leadId: lead.id,
        propertyId: prop.id,
        propertyAddress: prop.address,
        propertyTitle: prop.title,
        neighborhood: prop.neighborhood,
        assignedTo: prop.assigned_to,
        leadName: lead.name,
        leadEmail: lead.email,
        leadPhone: lead.phone,
        leadMessage: lead.message,
        source: lead.source,
        utm: (lead.utm as Record<string, string>) ?? {},
        createdAt: lead.created_at,
        photoUrl: prop.photos?.[0] ?? null,
        askingPrice: prop.asking_price,
        currency: prop.currency,
      })
    }

    // Disparar Meta CAPI SYNC (no fire-and-forget). En Netlify los procesos
    // serverless pueden congelarse después de responder al cliente, lo que
    // mata fetches pendientes. Por eso lo hacemos awaited con timeout 3s
    // interno — agregamos hasta 3s al peor caso del endpoint, pero
    // garantizamos que el evento se manda (o se loggea el error).
    // El Pixel client ya disparó el evento Lead con el mismo eventId
    // (Meta dedupea automáticamente).
    if (parsed.data.eventId) {
      try {
        await sendLeadToCapi({
          eventId: parsed.data.eventId,
          propertyId: prop.id,
          propertyTitle: prop.title ?? prop.address,
          askingPrice: prop.asking_price,
          currency: prop.currency,
          leadName: lead.name,
          leadEmail: lead.email,
          leadPhone: lead.phone,
          eventSourceUrl: parsed.data.eventSourceUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar'}/p/${prop.id}`,
          fbp: parsed.data.fbp ?? null,
          fbc: parsed.data.fbc ?? null,
          clientIp: ip !== 'unknown' ? ip : null,
          clientUserAgent: req.headers.get('user-agent'),
        })
      } catch (err) {
        // Nunca fallar el response del lead por un error de CAPI.
        console.error('[capi lead] failed (lead still saved)', err)
      }
    }

    return NextResponse.json({
      ok: true,
      id: lead.id,
      // `whatsappSent` refleja el envío real (ver sendRecorridoWhatsapp arriba).
      // La pantalla de gracias solo promete un WhatsApp cuando esto es true;
      // si no, muestra el link igual con un texto honesto.
      // `hasRecorrido` evita que la pantalla de gracias prometa un recorrido
      // que la propiedad no tiene (el link igual sirve: fotos + agenda).
      ...(token ? { accessUrl: accessUrl(token), whatsappSent, hasRecorrido: hayRecorrido } : {}),
    })
  } catch (err) {
    console.error('[POST /api/leads]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

const DeleteLeadsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
})

/**
 * DELETE /api/leads
 * Papelera de leads: borrado SIEMPRE lógico (`deleted_at = now()`), nunca un
 * DELETE de SQL — es una regla dura del usuario (ver CLAUDE.md). Restaurar es
 * `POST /api/leads/restore`, que vuelve a poner `deleted_at` en NULL.
 * Solo roles de operaciones (admin/dueño/coordinador); el asesor no puede
 * borrar leads.
 */
export async function DELETE(req: Request) {
  try {
    const user = await requireAuth()
    if (!OPS_ROLES.includes(user.profile.role as (typeof OPS_ROLES)[number])) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const parsed = DeleteLeadsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', detail: parsed.error.flatten() },
        { status: 400 },
      )
    }

    // `deleted_at` no está en el Database type generado — ver getAdminRaw().
    const supabase = getAdminRaw()
    const { data, error } = await supabase
      .from('property_leads')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', parsed.data.ids)
      .is('deleted_at', null) // idempotente: no re-marca lo ya borrado
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, deleted: (data ?? []).length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

function notifyAdvisorAsync(input: {
  leadId: string
  propertyId: string
  propertyAddress: string
  propertyTitle: string | null
  neighborhood: string | null
  assignedTo: string
  leadName: string
  leadEmail: string | null
  leadPhone: string | null
  leadMessage: string | null
  source: string
  utm: Record<string, string>
  createdAt: string
  photoUrl: string | null
  askingPrice: number
  currency: string
}) {
  // Dynamic import + fire-and-forget (no bloquea la respuesta al usuario)
  import('@/lib/email/notifications/lead-notification')
    .then(({ notifyLeadReceived }) => notifyLeadReceived(input))
    .catch(err => console.error('[lead notification]', err))
}

async function sendLeadToCapi(input: {
  eventId: string
  propertyId: string
  propertyTitle: string
  askingPrice: number
  currency: string
  leadName: string
  leadEmail: string | null
  leadPhone: string | null
  eventSourceUrl: string
  fbp: string | null
  fbc: string | null
  clientIp: string | null
  clientUserAgent: string | null
}): Promise<void> {
  // Split name → firstName/lastName por convención Meta (mejor match rate).
  const [firstName, ...rest] = input.leadName.trim().split(/\s+/)
  const lastName = rest.join(' ') || null

  const { sendCapiEvent } = await import('@/lib/marketing/meta-capi')
  const result = await sendCapiEvent({
    eventName: 'Lead',
    eventId: input.eventId,
    eventSourceUrl: input.eventSourceUrl,
    userData: {
      email: input.leadEmail,
      phone: input.leadPhone,
      firstName,
      lastName,
      countryCode: 'ar',
      fbp: input.fbp,
      fbc: input.fbc,
      clientIpAddress: input.clientIp,
      clientUserAgent: input.clientUserAgent,
    },
    customData: {
      contentIds: [input.propertyId],
      contentName: input.propertyTitle,
      contentType: 'property',
      contentCategory: 'real_estate',
      value: input.askingPrice,
      currency: input.currency,
    },
    testEventCode: process.env.META_TEST_EVENT_CODE || undefined,
  })
  if (!result.ok) {
    console.warn('[capi lead] failed', result.error, result.fbtraceId)
  }
}

