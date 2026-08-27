import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { InquiryType, Portal } from './types'
import { sendWhatsappTemplate, normalizePhone } from '../whatsapp/meta-cloud'
import { CUERPOS_DE_PLANTILLA } from '../whatsapp/cuerpos'
import {
  variantesDeSaludo,
  espacioParaElLink,
  armarLinkRespuesta,
  sanitizarParametro,
  ajustarAlTope,
} from './reply-link'
import { acortar } from '@/lib/links/short-link-store'
import { codigoDeUrlCorta } from '@/lib/links/short-link'

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
  propertyLabel: string // "Propiedad" (dirección; o "⚠️ CÓD X · título" si el aviso no está registrado)
  /** Cómo nombrar la propiedad EN EL SALUDO al interesado: dirección o título
   *  limpios, nunca el código ni la marca de alerta. null = omitir la mención. */
  leadPropertyLabel?: string | null
  avisoLabel: string // "Aviso" (título/código/url)
  leadName: string | null
  leadPhone: string | null
  leadEmail: string | null
  message: string | null
  assignedTo: string | null
  /** Propiedad matcheada (si la hay) — para que `whatsapp_messages` la asocie. */
  propertyId?: string | null
}

export interface NotifyResult {
  sent: number
  skipped: number
  failed: number
}

function firstNameUpper(fullName: string | null): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0]
  return first ? first.toUpperCase() : 'SIN ASIGNAR'
}

/**
 * El cuerpo aprobado contra el que se mide el presupuesto de caracteres.
 *
 * Sale del registro sincronizado con Meta, así que si la plantilla se edita el
 * cálculo se ajusta solo. Si `WHATSAPP_TEMPLATE_NAME` apunta a una plantilla que
 * todavía no se sincronizó, se mide contra la de siempre: mismo formato de 10
 * parámetros, y errar por un par de caracteres es infinitamente mejor que no
 * medir nada.
 */
const CUERPO_DE_REFERENCIA =
  CUERPOS_DE_PLANTILLA[TEMPLATE] ?? CUERPOS_DE_PLANTILLA['consulta_portal_util']

/** El "Aviso" ({{6}}) es el parámetro que cede si el cuerpo no entra en el tope. */
const INDICE_AVISO = 5

/**
 * Las plantillas que TIENEN el botón "Responder al interesado".
 *
 * Mandarle a Meta un componente de botón que la plantilla aprobada no declara
 * hace que RECHACE el envío entero. Mientras `WHATSAPP_TEMPLATE_NAME` siga
 * apuntando a `consulta_portal_util` (sin botón), acá no se manda nada y los
 * avisos salen como hoy. Cuando Meta apruebe `consulta_portal_v2` y se cambie
 * esa variable en Netlify, el botón se enciende solo — sin tocar código.
 */
const PLANTILLAS_CON_BOTON = new Set(['consulta_portal_v2'])

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
 * El link ({{10}}) es un `wa.me` DIRECTO, sin acortador: es lo único que hace
 * que WhatsApp abra el chat del interesado en vez de mandar al navegador. El
 * precio es que ocupa lugar, así que se arma último, con lo que sobra del tope
 * de 1024 de Meta. Ver `./reply-link.ts`.
 */
async function buildBodyParams(
  inq: NotifyInquiry,
  advisorLabel: string,
  saludos: string[],
): Promise<{ params: string[]; codigoBoton?: string }> {
  const otros = [
    sanitizarParametro(advisorLabel, 40),
    // Sin '#': la plantilla aprobada ya dice "Consulta #{{2}}". Con el '#' acá
    // el mensaje salía "Consulta ##291".
    sanitizarParametro(String(inq.seq), 12),
    sanitizarParametro(PORTAL_LABEL[inq.portal], 40),
    sanitizarParametro(inq.inquiryType ? TYPE_LABEL[inq.inquiryType] : '—', 20),
    sanitizarParametro(inq.propertyLabel, 120),
    sanitizarParametro(inq.avisoLabel, 120),
    sanitizarParametro(inq.leadName, 80),
    sanitizarParametro(inq.leadPhone, 40),
    sanitizarParametro(inq.leadEmail, 80),
  ]
  const phone = normalizePhone(inq.leadPhone)
  // El saludo va COMPLETO (`Infinity`): el largo deja de importar porque el link
  // viaja acortado con nuestro dominio, ~31 caracteres en el mensaje.
  const largo = armarLinkRespuesta(phone, saludos, Infinity)
  const corto = phone ? await acortar(largo) : null
  // Sin acortador (caído, tabla ausente, lo que sea) el aviso igual sale: se
  // manda el `wa.me` crudo, y AHÍ sí hay que medirlo contra el tope de Meta.
  const link = corto ?? armarLinkRespuesta(phone, saludos, espacioParaElLink(CUERPO_DE_REFERENCIA, otros))
  return {
    params: ajustarAlTope(CUERPO_DE_REFERENCIA, [...otros, link], INDICE_AVISO),
    // El botón recibe SOLO el código: la parte fija de la URL vive en la
    // plantilla aprobada. Sin acortador no hay botón posible (el `wa.me` crudo
    // no se puede partir en base + sufijo), pero el link del cuerpo sigue ahí.
    codigoBoton: corto ? (codigoDeUrlCorta(corto) ?? undefined) : undefined,
  }
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
  const saludos = variantesDeSaludo({
    leadName: inq.leadName,
    advisorName: respondingProfile?.full_name ?? 'el equipo',
    // El aviso del portal se le pasa TAMBIÉN al interesado, al final del saludo.
    // `avisoLabel` ya es `match.external_url || parsed.propertyUrl || …`: cuando
    // el cron tiene el enlace, es esto. Cuando no, trae un título o un código y
    // `variantesDeSaludo` lo descarta solo — no hace falta distinguirlo acá.
    avisoUrl: inq.avisoLabel,
    // El saludo al interesado usa el label limpio; si el cron no lo mandó
    // (llamadas viejas), cae al propertyLabel de siempre.
    propertyLabel: inq.leadPropertyLabel !== undefined ? inq.leadPropertyLabel : inq.propertyLabel,
  })
  const { params: bodyParams, codigoBoton } = await buildBodyParams(inq, advisorLabel, saludos)
  const urlButtonParam = PLANTILLAS_CON_BOTON.has(TEMPLATE) ? codigoBoton : undefined
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

    const send = await sendWhatsappTemplate({
      to: phone,
      templateName: TEMPLATE,
      languageCode: LANG,
      bodyParams,
      urlButtonParam,
      propertyId: inq.propertyId,
    })
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
    const send = await sendWhatsappTemplate({
      to: cc,
      templateName: TEMPLATE,
      languageCode: LANG,
      bodyParams,
      urlButtonParam,
      propertyId: inq.propertyId,
    })
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
