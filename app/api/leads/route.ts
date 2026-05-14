import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
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

const SIMPLE_RATE: Map<string, number[]> = new Map()
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 5 // 5 leads por minuto por IP

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (SIMPLE_RATE.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  if (hits.length >= RATE_MAX) return true
  hits.push(now)
  SIMPLE_RATE.set(ip, hits)
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

    // Disparar email al asesor fire-and-forget (no bloqueamos el response)
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
