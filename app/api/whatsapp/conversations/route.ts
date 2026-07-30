import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'

/**
 * GET /api/whatsapp/conversations
 *
 * Lista las conversaciones de WhatsApp agrupadas por `phone_e164` (la clave
 * de conversación — ver COMMENT de la migración `20260730000001`). Alimenta
 * el chat del Inbox.
 *
 * Gate: solo operaciones (admin/dueno/coordinador) + asesor. El abogado tiene
 * prohibido el acceso a leads en toda la app (mismo criterio que
 * `/api/leads`), así que acá también queda afuera con 403.
 *
 * Asesor: solo ve conversaciones de SUS propiedades — resuelto vía
 * `whatsapp_messages.property_id` directo, o indirecto a través de
 * `whatsapp_messages.lead_id → property_leads.property_id` /
 * `property_leads.assigned_to`. Mismo patrón que `authorize()` en
 * `app/api/leads/[id]/route.ts`.
 *
 * `whatsapp_messages` NO está en `types/database.types.ts` (ver comentario en
 * `lib/integrations/whatsapp/log.ts`): cliente admin SIN el genérico
 * `<Database>` + cast manual.
 *
 * Respuesta: `{ data: Conversation[] }` con
 * ```
 * Conversation = {
 *   phone_e164: string
 *   contact_name: string | null   // perfil de WhatsApp (Meta) o, si no hay, el nombre del lead
 *   lead_id: string | null
 *   property_id: string | null
 *   property: { id, address, title } | null
 *   last_message: string | null
 *   last_direction: 'in' | 'out'
 *   last_status: string
 *   last_at: string               // ISO
 *   unread_count: number          // entrantes con status='received'
 * }
 * ```
 * Ordenado por `last_at` desc.
 *
 * LÍMITE CONOCIDO (documentado, no resuelto acá): esto agrupa en memoria
 * sobre los últimos `SCAN_LIMIT` mensajes (no hay GROUP BY vía supabase-js sin
 * una RPC, y `whatsapp_messages` no tiene una vista/rollup todavía). Si el
 * volumen de mensajes crece mucho, una conversación vieja sin actividad
 * reciente podría no aparecer en la lista. Igual que `/metrics`, si esto se
 * vuelve un problema real conviene una RPC de agregación — no agregada acá
 * para no anticipar una migración que el usuario no pidió.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador', 'asesor']
const SCAN_LIMIT = 5000

interface MessageRow {
  id: string
  direction: 'in' | 'out'
  phone_e164: string
  contact_name: string | null
  lead_id: string | null
  property_id: string | null
  body_preview: string | null
  status: string
  created_at: string
}

interface ConversationAcc {
  phone_e164: string
  contact_name: string | null
  lead_id: string | null
  property_id: string | null
  last_message: string | null
  last_direction: 'in' | 'out'
  last_status: string
  last_at: string
  unread_count: number
}

export async function GET() {
  try {
    const user = await requireAuth()
    const role = user.profile.role
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = admin()

    const { data: rows, error } = await supabase
      .from('whatsapp_messages')
      .select('id, direction, phone_e164, contact_name, lead_id, property_id, body_preview, status, created_at')
      .order('created_at', { ascending: false })
      .limit(SCAN_LIMIT)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const allRows = (rows ?? []) as MessageRow[]

    // Agrupar por phone_e164. Como allRows viene ordenado desc, la PRIMERA vez
    // que vemos un teléfono es su mensaje más reciente.
    const groups = new Map<string, ConversationAcc>()
    for (const row of allRows) {
      let g = groups.get(row.phone_e164)
      if (!g) {
        g = {
          phone_e164: row.phone_e164,
          contact_name: row.contact_name,
          lead_id: row.lead_id,
          property_id: row.property_id,
          last_message: row.body_preview,
          last_direction: row.direction,
          last_status: row.status,
          last_at: row.created_at,
          unread_count: 0,
        }
        groups.set(row.phone_e164, g)
      } else {
        // Completar datos que el mensaje más reciente no tenía (ej. un entrante
        // viejo trae el contact_name pero el último mensaje es saliente).
        if (!g.contact_name && row.contact_name) g.contact_name = row.contact_name
        if (!g.lead_id && row.lead_id) g.lead_id = row.lead_id
        if (!g.property_id && row.property_id) g.property_id = row.property_id
      }
      if (row.direction === 'in' && row.status === 'received') g.unread_count += 1
    }

    // Hidratar leads referenciados (para property_id indirecto + nombre de fallback + ownership de asesor).
    const leadIds = Array.from(new Set(Array.from(groups.values()).map(g => g.lead_id).filter((x): x is string => !!x)))
    let leadsMap = new Map<string, { id: string; property_id: string; name: string; assigned_to: string | null }>()
    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from('property_leads')
        .select('id, property_id, name, assigned_to')
        .in('id', leadIds)
      leadsMap = new Map((leads ?? []).map(l => [l.id, l]))
    }

    for (const g of groups.values()) {
      const lead = g.lead_id ? leadsMap.get(g.lead_id) : null
      if (!g.property_id && lead?.property_id) g.property_id = lead.property_id
      if (!g.contact_name && lead?.name) g.contact_name = lead.name
    }

    // Filtro de asesor: solo conversaciones de sus propiedades.
    let list = Array.from(groups.values())
    if (role === 'asesor') {
      const { data: props } = await supabase.from('properties').select('id').eq('assigned_to', user.id)
      const asesorPropertyIds = new Set((props ?? []).map(p => p.id))
      list = list.filter(g => {
        if (g.property_id && asesorPropertyIds.has(g.property_id)) return true
        const lead = g.lead_id ? leadsMap.get(g.lead_id) : null
        if (lead?.assigned_to === user.id) return true
        return false
      })
    }

    // Hidratar propiedades para el label.
    const propertyIds = Array.from(new Set(list.map(g => g.property_id).filter((x): x is string => !!x)))
    let propsMap = new Map<string, { id: string; address: string; title: string | null }>()
    if (propertyIds.length > 0) {
      const { data: props } = await supabase
        .from('properties')
        .select('id, address, title')
        .in('id', propertyIds)
      propsMap = new Map((props ?? []).map(p => [p.id, p]))
    }

    const data = list
      .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
      .map(g => ({
        phone_e164: g.phone_e164,
        contact_name: g.contact_name,
        lead_id: g.lead_id,
        property_id: g.property_id,
        property: g.property_id ? (propsMap.get(g.property_id) ?? null) : null,
        last_message: g.last_message,
        last_direction: g.last_direction,
        last_status: g.last_status,
        last_at: g.last_at,
        unread_count: g.unread_count,
      }))

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
