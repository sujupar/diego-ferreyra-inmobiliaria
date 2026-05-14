/**
 * Wrapper para WhatsApp Business Cloud API (Meta).
 *
 * Usado para notificar al asesor cuando llega un lead nuevo, en paralelo
 * al email. La política de Meta requiere que los mensajes business-initiated
 * fuera de la ventana de 24h del usuario sean template messages pre-aprobados.
 *
 * Setup en Meta Business Manager:
 *  1. Crear WhatsApp Business Account (WABA)
 *  2. Verificar número de teléfono business
 *  3. Crear template (categoría UTILITY o MARKETING) y esperar aprobación
 *  4. Generar token permanente con permisos whatsapp_business_messaging
 *
 * Env vars:
 *  - WHATSAPP_PHONE_NUMBER_ID: ID del número business (no el número en sí)
 *  - WHATSAPP_ACCESS_TOKEN: token de sistema usuario (permanente preferido)
 *  - WHATSAPP_LEAD_TEMPLATE: nombre del template aprobado para leads
 *  - WHATSAPP_LEAD_TEMPLATE_LANG: código de idioma (ej. 'es_AR', 'es')
 *
 * Si cualquiera de las primeras dos faltan, el módulo no envía (no-op).
 * Los hooks que lo usan deben tolerar el no-op (es best-effort).
 */

const META_GRAPH = 'https://graph.facebook.com/v21.0'

interface SendTemplateInput {
  /** Número destino en formato E.164 sin "+". Ej: "5491145678901" */
  to: string
  templateName: string
  language: string
  /** Variables para el body del template, en orden */
  bodyParams?: string[]
}

interface MetaWhatsAppResponse {
  messages?: Array<{ id: string }>
  error?: { message: string; code: number }
}

/**
 * Normaliza un número telefónico a formato E.164 sin "+".
 * Maneja números argentinos típicos: "+54 11 1234-5678", "11-1234-5678", etc.
 * Si ya viene con código de país (+54 o 54), lo respeta.
 * Si empieza con 0 o 15, asume Argentina (54) + Buenos Aires (11).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^\d]/g, '')
  if (!cleaned) return null
  // Si empieza con 54, asumimos que ya está formateado
  if (cleaned.startsWith('54')) return cleaned
  // Si tiene 10 dígitos (ej. 1145678901), prepend 54
  if (cleaned.length === 10) return `54${cleaned}`
  // Si tiene 11 dígitos y empieza con 0, sacar el 0 y prepend 54
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return `54${cleaned.slice(1)}`
  }
  // Default: prepend 54
  return `54${cleaned}`
}

export interface SendTemplateResult {
  ok: boolean
  messageId?: string
  error?: string
  skipped?: 'not_configured' | 'no_phone' | 'invalid_phone'
}

export async function sendWhatsAppTemplate(
  input: SendTemplateInput,
): Promise<SendTemplateResult> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneId || !token) {
    return { ok: false, skipped: 'not_configured' }
  }

  const normalizedTo = normalizePhone(input.to)
  if (!normalizedTo) return { ok: false, skipped: 'invalid_phone' }

  const components = input.bodyParams && input.bodyParams.length > 0
    ? [
        {
          type: 'body',
          parameters: input.bodyParams.map(text => ({ type: 'text', text })),
        },
      ]
    : []

  const body = {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.language },
      components,
    },
  }

  try {
    const res = await fetch(`${META_GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as MetaWhatsAppResponse
    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `HTTP ${res.status}`
      return { ok: false, error: msg }
    }
    const messageId = data.messages?.[0]?.id
    return { ok: true, messageId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch error' }
  }
}

/**
 * Envía notificación de lead nuevo al asesor.
 * Template esperado tiene 4 variables: {1} nombre asesor, {2} nombre cliente,
 * {3} teléfono cliente, {4} dirección de la propiedad.
 *
 * Si el template name no está configurado, no envía.
 */
export async function notifyLeadByWhatsApp(input: {
  advisorPhone: string | null
  advisorName: string
  leadName: string
  leadPhone: string | null
  leadEmail: string | null
  propertyAddress: string
}): Promise<SendTemplateResult> {
  if (!input.advisorPhone) return { ok: false, skipped: 'no_phone' }

  const templateName = process.env.WHATSAPP_LEAD_TEMPLATE
  const language = process.env.WHATSAPP_LEAD_TEMPLATE_LANG ?? 'es_AR'
  if (!templateName) return { ok: false, skipped: 'not_configured' }

  // Contact info: privilegiamos teléfono > email > "-"
  const contactInfo = input.leadPhone ?? input.leadEmail ?? '-'

  return sendWhatsAppTemplate({
    to: input.advisorPhone,
    templateName,
    language,
    bodyParams: [
      input.advisorName,
      input.leadName,
      contactInfo,
      input.propertyAddress,
    ],
  })
}
