import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

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

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const supabase = getAdmin()

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
      .select('id, property_id, name, email, phone, message, source, status, assigned_to, notes, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit)

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
 */
async function isDuplicate(
  supabase: ReturnType<typeof getAdmin>,
  propertyId: string,
  email: string | null,
  phone: string | null,
): Promise<boolean> {
  if (!email && !phone) return false
  const since = new Date(Date.now() - 5 * 60_000).toISOString()
  let query = supabase
    .from('property_leads')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .gte('created_at', since)
  if (email && phone) {
    query = query.or(`email.eq.${email},phone.eq.${phone}`)
  } else if (email) {
    query = query.eq('email', email)
  } else if (phone) {
    query = query.eq('phone', phone)
  }
  const { count } = await query
  return (count ?? 0) > 0
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
      .select('id, address, title, neighborhood, assigned_to, status')
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

    const { data: lead, error: insErr } = await supabase
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
      })
      .select()
      .single()
    if (insErr || !lead) {
      return NextResponse.json(
        { error: insErr?.message ?? 'No pudimos guardar la consulta' },
        { status: 500 },
      )
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
      })
      notifyAdvisorWhatsAppAsync({
        assignedTo: prop.assigned_to,
        leadName: lead.name,
        leadPhone: lead.phone,
        leadEmail: lead.email,
        propertyAddress: prop.address,
      })
    }

    return NextResponse.json({ ok: true, id: lead.id })
  } catch (err) {
    console.error('[POST /api/leads]', err)
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
}) {
  // Dynamic import + fire-and-forget (no bloquea la respuesta al usuario)
  import('@/lib/email/notifications/lead-notification')
    .then(({ notifyLeadReceived }) => notifyLeadReceived(input))
    .catch(err => console.error('[lead notification]', err))
}

/**
 * Notificación WhatsApp al asesor — fire-and-forget.
 * Si WhatsApp Cloud API no está configurada, simplemente no envía.
 * No bloquea la respuesta al cliente que envió el lead.
 */
function notifyAdvisorWhatsAppAsync(input: {
  assignedTo: string
  leadName: string
  leadPhone: string | null
  leadEmail: string | null
  propertyAddress: string
}) {
  ;(async () => {
    try {
      const supabase = getAdmin()
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', input.assignedTo)
        .single()
      if (!profile?.phone) return // sin teléfono del asesor → skip
      const { notifyLeadByWhatsApp } = await import('@/lib/messaging/whatsapp-cloud')
      const result = await notifyLeadByWhatsApp({
        advisorPhone: profile.phone,
        advisorName: profile.full_name || 'Asesor',
        leadName: input.leadName,
        leadPhone: input.leadPhone,
        leadEmail: input.leadEmail,
        propertyAddress: input.propertyAddress,
      })
      if (!result.ok && result.skipped !== 'not_configured') {
        console.warn('[whatsapp lead]', result.error ?? result.skipped)
      }
    } catch (err) {
      console.error('[whatsapp lead]', err)
    }
  })()
}
