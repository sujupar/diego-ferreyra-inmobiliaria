import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { InquiryType, Portal } from './types'
import { sendWhatsappTemplate, normalizePhone } from '../whatsapp/meta-cloud'

/**
 * Orquesta el envío de WhatsApp para una consulta nueva:
 *  - destinatarios: el asesor asignado (si lo hay) + Diego (dueño) siempre.
 *  - idempotencia: no reenvía un 'sent' para el mismo (inquiry, teléfono).
 *  - registra cada intento en portal_inquiry_notifications (sent/failed/skipped).
 */

// Default UTILITY (no el MARKETING viejo): las notificaciones de consulta son
// mensajes de servicio disparados por una acción del lead → categoría UTILITY,
// SIN tope de frecuencia. El template MARKETING `nueva_consulta_portal` se acepta
// (status=sent) pero Meta lo RETIENE por el tope de marketing (no entrega). Ver
// CLAUDE.md / memory portal_inquiries_whatsapp. NUNCA volver a MARKETING acá.
const TEMPLATE = process.env.WHATSAPP_TEMPLATE_NAME ?? 'consulta_portal_util'
const LANG = process.env.WHATSAPP_TEMPLATE_LANG ?? 'es_AR'

const PORTAL_LABEL: Record<Portal, string> = {
  mercadolibre: 'MercadoLibre',
  zonaprop: 'ZonaProp',
  argenprop: 'Argenprop',
}

const TYPE_LABEL: Record<InquiryType, string> = {
  mail: 'Mail',
  whatsapp: 'WhatsApp',
  phone: 'Teléfono',
}

interface ProfileLite {
  id: string
  full_name: string | null
  phone: string | null
  role: string
}

export interface NotifyInquiry {
  id: string
  seq: number
  portal: Portal
  inquiryType: InquiryType | null
  propertyLabel: string // "Propiedad" (dirección)
  avisoLabel: string // "Aviso" (título/código/url)
  leadName: string | null
  leadPhone: string | null
  leadEmail: string | null
  message: string | null
  assignedTo: string | null
}

export interface NotifyResult {
  sent: number
  skipped: number
  failed: number
}

/** Meta rechaza params de plantilla con saltos de línea, tabs o >4 espacios. */
function sanitizeParam(s: string | null | undefined, max = 300): string {
  const clean = (s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (!clean) return '-'
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function firstNameUpper(fullName: string | null): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0]
  return first ? first.toUpperCase() : 'SIN ASIGNAR'
}

/**
 * Link wa.me para que el asesor responda al interesado con un saludo pre-armado.
 * Si no hay teléfono válido, devuelve el aviso (como en la captura del usuario).
 */
/** Acorta una URL con TinyURL (sin auth). Si falla, devuelve la URL original. */
async function shortenUrl(url: string): Promise<string> {
  try {
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const short = (await res.text()).trim()
      if (/^https?:\/\//.test(short)) return short
    }
  } catch {
    // TinyURL caído / rate-limit → usamos la URL completa (larga pero funcional).
  }
  return url
}

async function buildReplyLink(
  leadPhone: string | null, leadName: string | null, advisorName: string, propertyLabel: string,
): Promise<string> {
  const phone = normalizePhone(leadPhone)
  if (!phone) return '⚠️ No pude armar el link porque falta un teléfono válido'
  // Saludo COMPLETO y bien estructurado para contactar al prospecto; el link se
  // acorta con TinyURL (queda tipo tinyurl.com/xxxx en el WhatsApp).
  const greeting =
    `Hola ${(leadName ?? '').trim()}, buen día! Mi nombre es ${advisorName}, un gusto saludarte. ` +
    `Te escribo por tu consulta de la propiedad en ${propertyLabel}.`
  const longUrl = `https://wa.me/${phone}?text=${encodeURIComponent(greeting.replace(/\s+/g, ' ').trim())}`
  return await shortenUrl(longUrl)
}

/**
 * Orden de parámetros del body de la plantilla. La plantilla aprobada en Meta
 * (WHATSAPP_TEMPLATE_NAME, idioma es_AR) DEBE tener exactamente 10 placeholders
 * en este orden — calca el formato de la captura del usuario:
 *
 *   🔥 NUEVO LEAD para {{1}}
 *   #{{2}}
 *
 *   🏢 Portal: {{3}}
 *   📌 Tipo: {{4}}
 *   🏠 Propiedad: {{5}}
 *   🧾 Aviso: {{6}}
 *
 *   👤 Nombre: {{7}}
 *   📞 Tel: {{8}}
 *   📧 Email: {{9}}
 *
 *   💬 Responder por WhatsApp:
 *   {{10}}
 *
 * El link wa.me ({{10}}) va URL-encodeado: no tiene espacios ni saltos, así que
 * cumple las restricciones de parámetros de Meta.
 */
function buildBodyParams(inq: NotifyInquiry, advisorLabel: string, replyLink: string): string[] {
  return [
    sanitizeParam(advisorLabel, 40),
    sanitizeParam(`#${inq.seq}`, 12),
    sanitizeParam(PORTAL_LABEL[inq.portal], 40),
    sanitizeParam(inq.inquiryType ? TYPE_LABEL[inq.inquiryType] : '—', 20),
    sanitizeParam(inq.propertyLabel, 120),
    sanitizeParam(inq.avisoLabel, 120),
    sanitizeParam(inq.leadName, 80),
    sanitizeParam(inq.leadPhone, 40),
    sanitizeParam(inq.leadEmail, 80),
    sanitizeParam(replyLink, 700),
  ]
}

async function getOwner(supabase: SupabaseClient): Promise<ProfileLite | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role')
    .eq('role', 'dueno')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  return (data as ProfileLite | null) ?? null
}

async function getProfile(supabase: SupabaseClient, id: string): Promise<ProfileLite | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()
  return (data as ProfileLite | null) ?? null
}

async function alreadySent(supabase: SupabaseClient, inquiryId: string, phone: string): Promise<boolean> {
  const { count } = await supabase
    .from('portal_inquiry_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('inquiry_id', inquiryId)
    .eq('recipient_phone', phone)
    .eq('status', 'sent')
  return (count ?? 0) > 0
}

async function logNotif(
  supabase: SupabaseClient,
  inquiryId: string,
  row: {
    recipient_phone: string
    recipient_profile_id: string | null
    status: 'sent' | 'failed' | 'skipped'
    provider_message_id?: string
    error_message?: string
    test_mode?: boolean
  },
) {
  try {
    await supabase.from('portal_inquiry_notifications').insert({
      inquiry_id: inquiryId,
      channel: 'whatsapp',
      recipient_phone: row.recipient_phone,
      recipient_profile_id: row.recipient_profile_id,
      status: row.status,
      provider_message_id: row.provider_message_id ?? null,
      error_message: row.error_message ?? null,
      test_mode: row.test_mode ?? false,
    })
  } catch (err) {
    console.error('[portal-notify] log insert failed:', err)
  }
}

export async function notifyInquiry(supabase: SupabaseClient, inq: NotifyInquiry): Promise<NotifyResult> {
  const result: NotifyResult = { sent: 0, skipped: 0, failed: 0 }
  const owner = await getOwner(supabase)
  const assignedProfile = inq.assignedTo ? await getProfile(supabase, inq.assignedTo) : null

  // Destinatarios: asesor asignado (si lo hay) + dueño (siempre, sin duplicar).
  const recipients: ProfileLite[] = []
  if (assignedProfile) recipients.push(assignedProfile)
  if (owner && !recipients.some(r => r.id === owner.id)) recipients.push(owner)

  if (recipients.length === 0) {
    console.warn(`[portal-notify] inquiry ${inq.id} sin destinatarios (no hay dueño ni asignado)`)
    return result
  }

  // El que responde (y firma el saludo) es el asesor asignado; sin match, Diego.
  const respondingProfile = assignedProfile ?? owner
  const advisorLabel = firstNameUpper(assignedProfile?.full_name ?? null)
  const replyLink = await buildReplyLink(
    inq.leadPhone, inq.leadName, respondingProfile?.full_name ?? 'el equipo', inq.propertyLabel,
  )
  const bodyParams = buildBodyParams(inq, advisorLabel, replyLink)
  const attemptedPhones = new Set<string>()

  for (const r of recipients) {
    const phone =
      normalizePhone(r.phone) ?? (r.role === 'dueno' ? normalizePhone(process.env.WHATSAPP_FALLBACK_PHONE) : null)
    if (!phone) {
      await logNotif(supabase, inq.id, {
        recipient_phone: r.phone ?? '(sin teléfono)',
        recipient_profile_id: r.id,
        status: 'skipped',
        error_message: 'perfil sin teléfono',
      })
      result.skipped++
      continue
    }
    attemptedPhones.add(phone)

    if (await alreadySent(supabase, inq.id, phone)) {
      result.skipped++
      continue
    }

    const send = await sendWhatsappTemplate({ to: phone, templateName: TEMPLATE, languageCode: LANG, bodyParams })
    const status: 'sent' | 'failed' | 'skipped' = send.ok ? (send.skipped ? 'skipped' : 'sent') : 'failed'
    await logNotif(supabase, inq.id, {
      recipient_phone: phone,
      recipient_profile_id: r.id,
      status,
      provider_message_id: send.messageId,
      error_message: send.error,
      test_mode: send.skipped,
    })
    if (status === 'sent') result.sent++
    else if (status === 'failed') result.failed++
    else result.skipped++
  }

  // CC de supervisión: números que SIEMPRE reciben (oversight), además del asesor + dueño.
  // Coma-separados en WHATSAPP_CC_PHONES (E.164 sin '+'). Dedup contra los ya notificados.
  for (const raw of (process.env.WHATSAPP_CC_PHONES ?? '').split(',')) {
    const cc = normalizePhone(raw.trim())
    if (!cc || attemptedPhones.has(cc)) continue
    attemptedPhones.add(cc)
    if (await alreadySent(supabase, inq.id, cc)) {
      result.skipped++
      continue
    }
    const send = await sendWhatsappTemplate({ to: cc, templateName: TEMPLATE, languageCode: LANG, bodyParams })
    const status: 'sent' | 'failed' | 'skipped' = send.ok ? (send.skipped ? 'skipped' : 'sent') : 'failed'
    await logNotif(supabase, inq.id, {
      recipient_phone: cc,
      recipient_profile_id: null,
      status,
      provider_message_id: send.messageId,
      error_message: send.error,
      test_mode: send.skipped,
    })
    if (status === 'sent') result.sent++
    else if (status === 'failed') result.failed++
    else result.skipped++
  }

  return result
}
