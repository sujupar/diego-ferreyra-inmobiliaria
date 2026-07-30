import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import { sendWhatsappText, sendWhatsappTemplate } from '@/lib/integrations/whatsapp/core'
import { serviceWindow } from '@/lib/integrations/whatsapp/window'

/**
 * POST /api/whatsapp/send
 *
 * Envía una respuesta desde el chat del Inbox. Dos modos (`type`):
 *   - `'text'`: texto libre. SOLO permitido si la ventana de 24hs desde el
 *     último entrante del cliente sigue abierta (`serviceWindow`). Si está
 *     cerrada, responde **409** SIN intentar el envío — Meta lo rechazaría
 *     igual y quedaría un mensaje fantasma logueado como 'failed'.
 *   - `'template'`: plantilla pre-aprobada por Meta. Siempre permitido
 *     (para eso existen las plantillas — abren o reabren la ventana).
 *
 * Gate: mismo criterio que el resto del chat — operaciones + asesor; el
 * asesor solo puede mandar a conversaciones de SUS propiedades (mismo check
 * de ownership que `GET /api/whatsapp/conversations/[phone]`).
 *
 * Registra siempre con `sent_by = user.id` (vía `sendWhatsappText` /
 * `sendWhatsappTemplate` → `logOutbound`).
 *
 * Body:
 * ```
 * { type: 'text', phone: string, text: string, leadId?: string|null, propertyId?: string|null }
 * { type: 'template', phone: string, templateName: string, languageCode: string,
 *   bodyParams?: string[], urlButtonParam?: string, leadId?: string|null, propertyId?: string|null }
 * ```
 * `type` es opcional y por default `'text'`.
 *
 * Respuesta 200: `{ ok: boolean, skipped: boolean, messageId: string|null, error: string|null, window: {open, msRemaining} }`
 * (`ok:false` es un envío que Meta rechazó — no una excepción; `sendWhatsapp*` nunca lanza).
 * Respuesta 400: `{ error: string }` — teléfono inválido para WhatsApp o body inválido.
 * Respuesta 403: `{ error: 'forbidden' }` — rol sin acceso, o asesor sin ownership de la conversación.
 * Respuesta 409: `{ error: string, window }` — texto libre con ventana cerrada.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador', 'asesor']

const BaseFields = {
  phone: z.string().trim().min(3).max(30),
  leadId: z.string().uuid().nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
}

const SendSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    ...BaseFields,
    text: z.string().trim().min(1).max(4096),
  }),
  z.object({
    type: z.literal('template'),
    ...BaseFields,
    templateName: z.string().trim().min(1),
    languageCode: z.string().trim().min(2),
    bodyParams: z.array(z.string()).default([]),
    urlButtonParam: z.string().trim().optional(),
  }),
])

/** Igual que en las otras 2 rutas de esta feature: verifica ownership real contra la base, nunca confía en el body crudo. */
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

/** Si el body no trae leadId/propertyId, los buscamos en el historial de la conversación (para no bloquear a un asesor que responde una conversación ya suya). */
async function findContextFromHistory(
  supabase: ReturnType<typeof admin>,
  phoneE164: string,
): Promise<{ leadId: string | null; propertyId: string | null }> {
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('lead_id, property_id')
    .eq('phone_e164', phoneE164)
    .not('lead_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { leadId: data?.lead_id ?? null, propertyId: data?.property_id ?? null }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const role = user.profile.role
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const parsed = SendSchema.safeParse(
      body && typeof body === 'object' && !('type' in body) ? { ...body, type: 'text' } : body,
    )
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detail: parsed.error.flatten() }, { status: 400 })
    }
    const input = parsed.data

    const normalizedTo = normalizeWhatsappPhone(input.phone)
    if (!normalizedTo) {
      return NextResponse.json({ error: 'Ese teléfono no es válido para WhatsApp' }, { status: 400 })
    }

    const supabase = admin()

    // AGUJERO CERRADO: antes `input.leadId` tenía PRECEDENCIA sobre el historial,
    // y solo se validaba que ese lead fuera del asesor que llama. Un asesor podía
    // escribirle al cliente de otro asesor mandando su propio `leadId`. El
    // historial de la conversación manda: los params del caller solo se usan
    // cuando la conversación todavía NO existe.
    const ctx = await findContextFromHistory(supabase, normalizedTo)
    const conversacionExiste = Boolean(ctx.leadId || ctx.propertyId)
    const leadId = conversacionExiste ? ctx.leadId : (input.leadId ?? null)
    const propertyId = conversacionExiste ? ctx.propertyId : (input.propertyId ?? null)

    if (role === 'asesor') {
      const owns = await isAsesorOwner(supabase, propertyId, leadId, user.id)
      if (!owns) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // Ventana: última entrada del cliente para ESTE teléfono.
    const { data: lastInbound } = await supabase
      .from('whatsapp_messages')
      .select('created_at')
      .eq('phone_e164', normalizedTo)
      .eq('direction', 'in')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const window = serviceWindow(lastInbound?.created_at ?? null, new Date())

    if (input.type === 'text' && !window.open) {
      return NextResponse.json(
        {
          error:
            'Este contacto no te escribió en las últimas 24hs, así que WhatsApp no deja mandarle texto libre. Tenés que arrancar de nuevo con una plantilla aprobada.',
          window,
        },
        { status: 409 },
      )
    }

    const result =
      input.type === 'text'
        ? await sendWhatsappText({
            to: normalizedTo,
            text: input.text,
            leadId,
            propertyId,
            sentBy: user.id,
          })
        : await sendWhatsappTemplate({
            to: normalizedTo,
            templateName: input.templateName,
            languageCode: input.languageCode,
            bodyParams: input.bodyParams,
            urlButtonParam: input.urlButtonParam,
            leadId,
            propertyId,
            sentBy: user.id,
          })

    return NextResponse.json({
      ok: result.ok,
      skipped: result.skipped,
      messageId: result.messageId ?? null,
      error: result.error ?? null,
      window,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
