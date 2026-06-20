import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createFunnelLead } from '@/lib/funnel/create-funnel-lead'
import { attributionToDealColumns } from '@/lib/funnel/attribution'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 5
const DEDUP_WINDOW_MS = 5 * 60_000

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

// Cliente admin sin tipar (igual que lib/supabase/deals.ts y tasks.ts y
// lib/funnel/create-funnel-lead.ts): el tipo generado `Database` está incompleto
// (no incluye `funnel_lead_submissions`), así que tiparlo rompería el `.from(...)`.
// Seguimos la convención del repo.
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

  // Rate-limit por IP (DB, sobrevive serverless)
  const rateSince = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count: ipCount } = await supabase
    .from('funnel_lead_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', rateSince)
  if ((ipCount ?? 0) >= RATE_MAX) {
    return NextResponse.json({ error: 'Demasiados envíos. Probá de nuevo en un minuto.' }, { status: 429 })
  }

  // Dedup por email/phone (5 min) → fingir éxito (no crear deal duplicado)
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
  for (const [col, val] of [['email', d.email], ['phone', d.phone]] as const) {
    if (!val) continue
    const { count } = await supabase
      .from('funnel_lead_submissions')
      .select('id', { count: 'exact', head: true })
      .eq(col, val)
      .gte('created_at', dedupSince)
    if ((count ?? 0) > 0) {
      return NextResponse.json({ ok: true, deduplicated: true, redirect: redirectFor(d.funnel) })
    }
  }

  // Crear el lead (contacto + deal + tarea + notificación)
  let result: { contactId: string; dealId: string }
  try {
    result = await createFunnelLead({
      funnel: d.funnel,
      name: d.name,
      email: d.email ?? null,
      phone: d.phone ?? null,
      propertyLocation: d.propertyLocation ?? null,
      tipoCliente: d.tipoCliente ?? null,
      message: d.message ?? null,
    })
  } catch (e) {
    console.error('[funnel/submit] createFunnelLead failed', e)
    return NextResponse.json({ error: 'No pudimos procesar tu envío. Probá de nuevo.' }, { status: 500 })
  }

  // Stitching: vincular la sesión anónima (analítica de video) al contacto + back-fill.
  if (d.anonId) {
    try {
      await supabase.rpc('link_anon_to_contact', { p_anon_id: d.anonId, p_contact_id: result.contactId })
    } catch (e) {
      console.warn('[funnel/submit] link_anon_to_contact failed', e)
    }
  }

  // Atribución de campaña → columnas meta_* del deal (lo que el asesor ve en el CRM).
  try {
    const metaCols = attributionToDealColumns(d.attribution)
    if (Object.keys(metaCols).length > 0) {
      await supabase.from('deals').update(metaCols).eq('id', result.dealId)
    }
  } catch (e) {
    console.warn('[funnel/submit] meta attribution update failed', e)
  }

  // Log del submission (rate-limit/dedup futuros + event_id para Fase 3)
  await supabase.from('funnel_lead_submissions').insert({
    funnel: d.funnel,
    ip_hash: ipHash,
    email: d.email ?? null,
    phone: d.phone ?? null,
    contact_id: result.contactId,
    deal_id: result.dealId,
    event_id: d.eventId ?? null,
  })

  // --- CAPI (Fase 3): conversión server-side con el MISMO event_id que el Pixel ---
  const eventName = d.funnel === 'clase' ? 'CompleteRegistration' : 'Lead'
  const contentName = d.funnel === 'clase' ? 'Clase Gratuita' : 'Tasación Directa'
  if (d.eventId) {
    const [firstName, ...rest] = d.name.trim().split(/\s+/)
    const userAgent = req.headers.get('user-agent')
    try {
      const { sendCapiEvent } = await import('@/lib/marketing/meta-capi')
      const capi = await sendCapiEvent({
        eventName,
        eventId: d.eventId,
        eventSourceUrl:
          d.eventSourceUrl ??
          `https://inmodf.com.ar/${d.funnel === 'clase' ? 'vsl-clase-propietarios' : 'tasacion-directa'}`,
        userData: {
          email: d.email ?? null,
          phone: d.phone ?? null,
          firstName: firstName ?? null,
          lastName: rest.join(' ') || null,
          city: d.funnel === 'tasacion' ? (d.propertyLocation ?? null) : null,
          countryCode: 'ar',
          externalId: result.contactId, // alto valor de match (hasheado en meta-capi)
          fbp: d.fbp ?? null,
          fbc: d.fbc ?? null,
          clientIpAddress: ip === 'unknown' ? null : ip,
          clientUserAgent: userAgent,
        },
        customData: { contentName },
        testEventCode: process.env.META_TEST_EVENT_CODE || undefined,
      })
      console.log('[funnel/submit capi]', { ok: capi.ok, received: capi.eventsReceived, error: capi.error, fbtrace: capi.fbtraceId, hasTestCode: !!process.env.META_TEST_EVENT_CODE, event: eventName })
    } catch (e) {
      console.warn('[funnel/submit capi] threw', e)
    }
  }

  return NextResponse.json({ ok: true, redirect: redirectFor(d.funnel) })
}
