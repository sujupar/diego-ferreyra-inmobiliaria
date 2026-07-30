import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { serviceWindow } from '@/lib/integrations/whatsapp/window'

/**
 * GET /api/whatsapp/conversations/[phone]
 *
 * Hilo completo de UNA conversación (`phone_e164` = el `[phone]` de la ruta,
 * el mismo formato E.164 sin '+' que usa `whatsapp_messages`). Devuelve los
 * mensajes en orden cronológico (ascendente, como un chat) + el estado de la
 * ventana de 24hs (`serviceWindow`, ver `lib/integrations/whatsapp/window.ts`)
 * para que el front sepa si puede ofrecer "texto libre" o solo "plantilla".
 *
 * Gate: mismo criterio que `GET /api/whatsapp/conversations` — operaciones +
 * asesor, abogado y el resto 403.
 *
 * Ownership del asesor: se resuelve por property_id/lead_id encontrados en
 * los propios mensajes de la conversación. Query params opcionales
 * `?leadId=&propertyId=` permiten al front afirmar el contexto de una
 * conversación TODAVÍA sin mensajes (ej. el asesor abre el chat desde la
 * ficha de un lead suyo antes de mandar el primer mensaje) — se verifican
 * contra la base igual, nunca se confía en el valor crudo del query param.
 *
 * Respuesta: `{ data: Thread }` con
 * ```
 * Thread = {
 *   phone_e164: string
 *   contact_name: string | null
 *   lead: { id: string, name: string } | null
 *   property: { id: string, address: string, title: string | null } | null
 *   window: { open: boolean, msRemaining: number }
 *   messages: Array<{
 *     id: string
 *     direction: 'in' | 'out'
 *     body_preview: string | null
 *     template_name: string | null
 *     status: string
 *     error_message: string | null
 *     sent_by: string | null
 *     created_at: string
 *   }>
 * }
 * ```
 * 404 si la conversación no existe Y no se pudo confirmar ownership por
 * query params (nada que mostrar, nada que autorizar).
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador', 'asesor']
// Suficiente para una conversación 1-a-1 real; no es la lista global (esa es
// SCAN_LIMIT en conversations/route.ts).
const HISTORY_LIMIT = 500

interface MessageRow {
  id: string
  direction: 'in' | 'out'
  contact_name: string | null
  lead_id: string | null
  property_id: string | null
  template_name: string | null
  body_preview: string | null
  status: string
  error_message: string | null
  sent_by: string | null
  created_at: string
}

/** Confirma que `userId` es dueño (asesor asignado) de la propiedad/lead candidatos. Nunca asume — siempre reconsulta la base. */
async function isAsesorOwner(
  supabase: ReturnType<typeof admin>,
  propertyId: string | null,
  leadId: string | null,
  userId: string,
): Promise<boolean> {
  if (propertyId) {
    const { data: prop } = await supabase.from('properties').select('assigned_to').eq('id', propertyId).maybeSingle()
    if (prop?.assigned_to === userId) return true
  }
  if (leadId) {
    const { data: lead } = await supabase
      .from('property_leads')
      .select('property_id, assigned_to')
      .eq('id', leadId)
      .maybeSingle()
    if (lead) {
      if (lead.assigned_to === userId) return true
      if (lead.property_id) {
        const { data: prop } = await supabase.from('properties').select('assigned_to').eq('id', lead.property_id).maybeSingle()
        if (prop?.assigned_to === userId) return true
      }
    }
  }
  return false
}

export async function GET(req: Request, { params }: { params: Promise<{ phone: string }> }) {
  try {
    const user = await requireAuth()
    const role = user.profile.role
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { phone } = await params
    const url = new URL(req.url)
    const queryLeadId = url.searchParams.get('leadId')
    const queryPropertyId = url.searchParams.get('propertyId')

    const supabase = admin()

    const { data: rows, error } = await supabase
      .from('whatsapp_messages')
      .select(
        'id, direction, contact_name, lead_id, property_id, template_name, body_preview, status, error_message, sent_by, created_at',
      )
      .eq('phone_e164', phone)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const desc = (rows ?? []) as MessageRow[]

    // Contexto (lead/propiedad/nombre): preferimos lo que traen los mensajes;
    // si la conversación está vacía, usamos los query params (verificados abajo).
    let contactName: string | null = null
    let leadId: string | null = queryLeadId
    let propertyId: string | null = queryPropertyId
    for (const row of desc) {
      if (!contactName && row.contact_name) contactName = row.contact_name
      if (!leadId && row.lead_id) leadId = row.lead_id
      if (!propertyId && row.property_id) propertyId = row.property_id
    }

    if (desc.length === 0 && !leadId && !propertyId) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    if (role === 'asesor') {
      const owns = await isAsesorOwner(supabase, propertyId, leadId, user.id)
      if (!owns) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // Ventana: el primer 'in' en orden descendente = el entrante más reciente.
    const lastInbound = desc.find(r => r.direction === 'in') ?? null
    const window = serviceWindow(lastInbound?.created_at ?? null, new Date())

    // Hidratar lead/property para el header del chat.
    let lead: { id: string; name: string } | null = null
    if (leadId) {
      const { data } = await supabase.from('property_leads').select('id, name').eq('id', leadId).maybeSingle()
      if (data) {
        lead = data
        if (!contactName) contactName = data.name
      }
    }
    let property: { id: string; address: string; title: string | null } | null = null
    if (propertyId) {
      const { data } = await supabase.from('properties').select('id, address, title').eq('id', propertyId).maybeSingle()
      if (data) property = data
    }

    const messages = [...desc]
      .reverse() // ascendente: orden de chat, del más viejo al más nuevo
      .map(r => ({
        id: r.id,
        direction: r.direction,
        body_preview: r.body_preview,
        template_name: r.template_name,
        status: r.status,
        error_message: r.error_message,
        sent_by: r.sent_by,
        created_at: r.created_at,
      }))

    return NextResponse.json({
      data: {
        phone_e164: phone,
        contact_name: contactName,
        lead,
        property,
        window,
        messages,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
