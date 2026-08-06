/**
 * Núcleo del cliente WhatsApp (Meta Cloud API), SIN 'server-only' para poder
 * reutilizarlo desde scripts (npx tsx). El wrapper `meta-cloud.ts` re-exporta
 * esto con el guard 'server-only' para la app.
 *
 * Mensajes iniciados por el negocio (los asesores no están en ventana de 24h)
 * ⇒ SOLO con PLANTILLA pre-aprobada por Meta.
 *
 * Env vars:
 *   WHATSAPP_PHONE_NUMBER_ID   — ID del número emisor (registrado en Cloud API)
 *   WHATSAPP_ACCESS_TOKEN      — system-user token con whatsapp_business_messaging
 *   WHATSAPP_API_VERSION       — ej. v21.0 (default v21.0)
 *   WHATSAPP_TEST_MODE         — 'true' para no enviar (default true por seguridad)
 */
import { normalizeWhatsappPhone } from './phone'
import { logOutbound } from './log'

/**
 * Timeout del POST a Meta. Sin esto una demora de Meta cuelga al llamador.
 * Default 8s para los envíos de fondo (cron de consultas de portales): ahí nadie
 * espera y cortar temprano es perder un aviso al asesor. El camino del recorrido
 * pasa 3s explícitamente, porque el visitante está esperando la respuesta.
 */
const WHATSAPP_TIMEOUT_DEFAULT_MS = 8000

export interface SendTemplateInput {
  /** De dónde nació la conversación (ver migración 20260806000001). */
  origen?: 'consulta_portal' | 'landing' | 'manual' | null
  to: string // E.164 sin '+', ej. 5491122334455
  templateName: string
  languageCode: string // ej. es_AR
  /** Parámetros de texto del body de la plantilla, en orden ({{1}}, {{2}}, ...). */
  bodyParams: string[]
  /** Sufijo dinámico del botón URL de la plantilla (ej. el token del recorrido). */
  urlButtonParam?: string
  /**
   * Archivo del ENCABEZADO, para plantillas que lo tienen (el plano o el video
   * de una consulta). Va en el primer mensaje, sin esperar a que la persona
   * conteste — es lo que hace posible mandar material fuera de la ventana.
   */
  headerMedia?: { type: 'document' | 'video' | 'image'; link: string; filename?: string }
  /** Timeout del POST a Meta en ms. Default 8s (envíos de fondo). */
  timeoutMs?: number
  /** Lead al que pertenece este mensaje (para el chat del Inbox). Opcional. */
  leadId?: string | null
  /** Propiedad a la que pertenece este mensaje. Opcional. */
  propertyId?: string | null
  /** Perfil que disparó el envío (si fue una acción de un asesor). Opcional. */
  sentBy?: string | null
}

export interface TemplatePayload {
  messaging_product: 'whatsapp'
  to: string
  type: 'template'
  template: {
    name: string
    language: { code: string }
    components: Array<Record<string, unknown>>
  }
}

export function buildTemplatePayload(input: SendTemplateInput): TemplatePayload {
  const components: Array<Record<string, unknown>> = []
  // El encabezado va PRIMERO: Meta valida el orden de los componentes.
  if (input.headerMedia) {
    const { type, link, filename } = input.headerMedia
    components.push({
      type: 'header',
      parameters: [
        { type, [type]: { link, ...(type === 'document' && filename ? { filename } : {}) } },
      ],
    })
  }
  components.push({ type: 'body', parameters: input.bodyParams.map(text => ({ type: 'text', text })) })
  // Botón URL con sufijo dinámico: Meta lo concatena a la URL fija de la
  // plantilla (ej. https://inmodf.com.ar/v/ + <token>). index va como string.
  if (input.urlButtonParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: input.urlButtonParam }],
    })
  }
  return {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'template',
    template: { name: input.templateName, language: { code: input.languageCode }, components },
  }
}

export interface SendTemplateResult {
  ok: boolean
  skipped: boolean // true si modo prueba / sin credenciales
  messageId?: string
  error?: string
  /**
   * Código de error de Meta. Sirve para distinguir "no se entregó porque el
   * cliente bloqueó las promociones" de "el número es inválido" — dos cosas que
   * requieren acciones opuestas y que un mensaje de texto no distingue.
   */
  errorCode?: number
}

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN)
}

/** Modo prueba: explícito por env, o implícito si faltan credenciales. */
export function whatsappTestMode(): boolean {
  if (!whatsappConfigured()) return true
  return process.env.WHATSAPP_TEST_MODE !== 'false'
}

/**
 * Normaliza un teléfono a E.164 sin '+' (formato que espera Cloud API).
 *
 * Delega en `normalizeWhatsappPhone` (./phone.ts), que valida contra
 * `libphonenumber-js/max` en vez de adivinar por longitud de dígitos. La
 * heurística vieja (anteponer '54' a cualquier cosa de 10-11 dígitos sin
 * código de país) convertía números del exterior en argentinos inexistentes
 * — ver el comentario al tope de `./phone.ts` para el bug real que esto causó.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  return normalizeWhatsappPhone(raw)
}

/** Preview corto y legible de los parámetros de la plantilla, para `whatsapp_messages.body_preview`. */
function bodyPreview(input: SendTemplateInput): string {
  return input.bodyParams.join(' · ').slice(0, 300)
}

/** Nunca lanza — devuelve el resultado para que el caller siga fire-and-forget. */
export async function sendWhatsappTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
  const body = buildTemplatePayload(input)

  if (whatsappTestMode()) {
    console.log(
      `[whatsapp:test] (no enviado) to=${input.to} template=${input.templateName} params=${JSON.stringify(input.bodyParams)}`,
    )
    // Registrado igual: 'skipped' significa "modo prueba / sin credenciales",
    // no "no pasó nada" — sigue siendo visibilidad útil de qué se HUBIERA mandado.
    await logOutbound({
      phone: input.to,
      templateName: input.templateName,
      bodyPreview: bodyPreview(input),
      payload: body,
      status: 'skipped',
      leadId: input.leadId,
      propertyId: input.propertyId,
      sentBy: input.sentBy,
    })
    return { ok: true, skipped: true }
  }

  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(input.timeoutMs ?? WHATSAPP_TIMEOUT_DEFAULT_MS),
    })
    const json = (await res.json().catch(() => ({}))) as {
      contacts?: { wa_id?: string }[]
      messages?: { id: string }[]
      error?: { message?: string; code?: number }
    }
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`
      console.error(`[whatsapp] envío falló a ${input.to}: ${msg}`)
      await logOutbound({
        phone: input.to,
        templateName: input.templateName,
        bodyPreview: bodyPreview(input),
        payload: json,
        status: 'failed',
        errorCode: json.error?.code != null ? String(json.error.code) : null,
        errorMessage: msg,
        leadId: input.leadId,
        propertyId: input.propertyId,
        sentBy: input.sentBy,
      })
      return { ok: false, skipped: false, error: msg, errorCode: json.error?.code }
    }
    // El estado inicial de un envío ACEPTADO por Meta es 'accepted' (no 'sent'):
    // 'sent' lo pone el webhook de estados (otra tarea) cuando Meta confirma la
    // entrega real. contacts[0].wa_id es el número CANÓNICO (puede diferir del
    // `to` que mandamos — Meta agrega el 9 a los móviles argentinos).
    const waId = json.contacts?.[0]?.wa_id ?? null
    const waMessageId = json.messages?.[0]?.id
    await logOutbound({
      phone: input.to,
      waId,
      waMessageId,
      templateName: input.templateName,
      bodyPreview: bodyPreview(input),
      payload: json,
      status: 'accepted',
      leadId: input.leadId,
      propertyId: input.propertyId,
      sentBy: input.sentBy,
    })
    return { ok: true, skipped: false, messageId: waMessageId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[whatsapp] excepción enviando a ${input.to}: ${msg}`)
    await logOutbound({
      phone: input.to,
      templateName: input.templateName,
      bodyPreview: bodyPreview(input),
      payload: body,
      status: 'failed',
      errorMessage: msg,
      leadId: input.leadId,
      propertyId: input.propertyId,
      sentBy: input.sentBy,
    })
    return { ok: false, skipped: false, error: msg }
  }
}

/**
 * Mensaje de TEXTO LIBRE (dentro de la ventana de 24hs post-entrante — ver
 * `./window.ts`). El caller (`POST /api/whatsapp/send`) es responsable de
 * chequear la ventana ANTES de llamar esto: acá no se valida, para que este
 * módulo siga sin tocar la base más que para loguear (mismo espíritu que
 * `sendWhatsappTemplate`).
 */
export interface SendTextInput {
  /** De dónde nació la conversación (ver migración 20260806000001). */
  origen?: 'consulta_portal' | 'landing' | 'manual' | null
  to: string // E.164 sin '+', ej. 5491122334455
  text: string
  /** Timeout del POST a Meta en ms. Default 8s. */
  timeoutMs?: number
  /** Lead al que pertenece este mensaje (para el chat del Inbox). Opcional. */
  leadId?: string | null
  /** Propiedad a la que pertenece este mensaje. Opcional. */
  propertyId?: string | null
  /** Perfil que disparó el envío (asesor/ops respondiendo desde el chat). Opcional. */
  sentBy?: string | null
  /** true = lo generó el agente de IA que agenda (task 3, 2026-08-03), no una persona. Ver `logOutbound`. */
  aiGenerated?: boolean
}

export interface TextPayload {
  messaging_product: 'whatsapp'
  to: string
  type: 'text'
  text: { body: string }
}

export function buildTextPayload(input: SendTextInput): TextPayload {
  return { messaging_product: 'whatsapp', to: input.to, type: 'text', text: { body: input.text } }
}

/** Mismo shape que `SendTemplateResult` — el caller no necesita distinguir. */
export type SendTextResult = SendTemplateResult

/**
 * Mensaje de MULTIMEDIA por LINK (imagen/video/documento), dentro de la
 * ventana de 24hs — mismo caller-checks-window-first que `sendWhatsappText`.
 * Usa el modo `link` de la Cloud API (Meta descarga el archivo desde esa URL),
 * NO el modo de subida de bytes — por eso `POST /api/whatsapp/send` restringe
 * `link` a hosts propios (Storage/landing), ver `isAllowedMediaLink` ahí.
 *
 * Nace de "Enviar información de la propiedad" (task 9, chat pro): mandar
 * fotos/video/planos reales al cliente, no solo texto con links.
 */
export interface SendMediaInput {
  /** De dónde nació la conversación (ver migración 20260806000001). */
  origen?: 'consulta_portal' | 'landing' | 'manual' | null
  to: string // E.164 sin '+'
  mediaType: 'image' | 'video' | 'document'
  link: string
  caption?: string
  /** Solo aplica a `document`. */
  filename?: string
  timeoutMs?: number
  leadId?: string | null
  propertyId?: string | null
  sentBy?: string | null
  /** `true` = lo manda el agente de IA. Marca la fila en `whatsapp_messages`. */
  aiGenerated?: boolean
}

export interface MediaPayload {
  messaging_product: 'whatsapp'
  to: string
  type: 'image' | 'video' | 'document'
  image?: { link: string; caption?: string }
  video?: { link: string; caption?: string }
  document?: { link: string; caption?: string; filename?: string }
}

export function buildMediaPayload(input: SendMediaInput): MediaPayload {
  const caption = input.caption ? { caption: input.caption } : {}
  if (input.mediaType === 'image') {
    return { messaging_product: 'whatsapp', to: input.to, type: 'image', image: { link: input.link, ...caption } }
  }
  if (input.mediaType === 'video') {
    return { messaging_product: 'whatsapp', to: input.to, type: 'video', video: { link: input.link, ...caption } }
  }
  return {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'document',
    document: { link: input.link, ...caption, ...(input.filename ? { filename: input.filename } : {}) },
  }
}

/** Mismo shape que `SendTemplateResult` — el caller no necesita distinguir. */
export type SendMediaResult = SendTemplateResult

function mediaBodyPreview(input: SendMediaInput): string {
  const etiqueta = input.mediaType === 'image' ? 'Foto' : input.mediaType === 'video' ? 'Video' : 'Documento'
  const detalle = input.caption ?? input.filename ?? input.link
  return `[${etiqueta}] ${detalle}`.slice(0, 300)
}

/** Nunca lanza — mismo contrato que `sendWhatsappText`/`sendWhatsappTemplate`. */
export async function sendWhatsappMedia(input: SendMediaInput): Promise<SendMediaResult> {
  const body = buildMediaPayload(input)
  const preview = mediaBodyPreview(input)

  if (whatsappTestMode()) {
    console.log(`[whatsapp:test] (no enviado) to=${input.to} ${input.mediaType} link=${input.link}`)
    await logOutbound({
      phone: input.to,
      bodyPreview: preview,
      payload: body,
      status: 'skipped',
      leadId: input.leadId,
      propertyId: input.propertyId,
      sentBy: input.sentBy,
      aiGenerated: input.aiGenerated,
      origen: input.origen,
    })
    return { ok: true, skipped: true }
  }

  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(input.timeoutMs ?? WHATSAPP_TIMEOUT_DEFAULT_MS),
    })
    const json = (await res.json().catch(() => ({}))) as {
      contacts?: { wa_id?: string }[]
      messages?: { id: string }[]
      error?: { message?: string; code?: number }
    }
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`
      console.error(`[whatsapp] envío de ${input.mediaType} falló a ${input.to}: ${msg}`)
      await logOutbound({
        phone: input.to,
        bodyPreview: preview,
        payload: json,
        status: 'failed',
        errorCode: json.error?.code != null ? String(json.error.code) : null,
        errorMessage: msg,
        leadId: input.leadId,
        propertyId: input.propertyId,
        sentBy: input.sentBy,
      aiGenerated: input.aiGenerated,
      origen: input.origen,
      })
      return { ok: false, skipped: false, error: msg }
    }
    const waId = json.contacts?.[0]?.wa_id ?? null
    const waMessageId = json.messages?.[0]?.id
    await logOutbound({
      phone: input.to,
      waId,
      waMessageId,
      bodyPreview: preview,
      payload: json,
      status: 'accepted',
      leadId: input.leadId,
      propertyId: input.propertyId,
      sentBy: input.sentBy,
      aiGenerated: input.aiGenerated,
      origen: input.origen,
    })
    return { ok: true, skipped: false, messageId: waMessageId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[whatsapp] excepción enviando ${input.mediaType} a ${input.to}: ${msg}`)
    await logOutbound({
      phone: input.to,
      bodyPreview: preview,
      payload: body,
      status: 'failed',
      errorMessage: msg,
      leadId: input.leadId,
      propertyId: input.propertyId,
      sentBy: input.sentBy,
      aiGenerated: input.aiGenerated,
      origen: input.origen,
    })
    return { ok: false, skipped: false, error: msg }
  }
}

/** Nunca lanza — devuelve el resultado para que el caller siga fire-and-forget. */
export async function sendWhatsappText(input: SendTextInput): Promise<SendTextResult> {
  const body = buildTextPayload(input)

  if (whatsappTestMode()) {
    console.log(`[whatsapp:test] (no enviado) to=${input.to} text=${input.text.slice(0, 120)}`)
    // Registrado igual: 'skipped' significa "modo prueba / sin credenciales".
    await logOutbound({
      phone: input.to,
      bodyPreview: input.text.slice(0, 300),
      payload: body,
      status: 'skipped',
      leadId: input.leadId,
      propertyId: input.propertyId,
      sentBy: input.sentBy,
      aiGenerated: input.aiGenerated,
      origen: input.origen,
    })
    return { ok: true, skipped: true }
  }

  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(input.timeoutMs ?? WHATSAPP_TIMEOUT_DEFAULT_MS),
    })
    const json = (await res.json().catch(() => ({}))) as {
      contacts?: { wa_id?: string }[]
      messages?: { id: string }[]
      error?: { message?: string; code?: number }
    }
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`
      console.error(`[whatsapp] envío de texto falló a ${input.to}: ${msg}`)
      await logOutbound({
        phone: input.to,
        bodyPreview: input.text.slice(0, 300),
        payload: json,
        status: 'failed',
        errorCode: json.error?.code != null ? String(json.error.code) : null,
        errorMessage: msg,
        leadId: input.leadId,
        propertyId: input.propertyId,
        sentBy: input.sentBy,
        aiGenerated: input.aiGenerated,
      origen: input.origen,
      })
      return { ok: false, skipped: false, error: msg }
    }
    // Mismo comentario que en sendWhatsappTemplate: estado inicial 'accepted',
    // no 'sent' — el webhook de estados lo va a ir actualizando.
    const waId = json.contacts?.[0]?.wa_id ?? null
    const waMessageId = json.messages?.[0]?.id
    await logOutbound({
      phone: input.to,
      waId,
      waMessageId,
      bodyPreview: input.text.slice(0, 300),
      payload: json,
      status: 'accepted',
      leadId: input.leadId,
      propertyId: input.propertyId,
      sentBy: input.sentBy,
      aiGenerated: input.aiGenerated,
      origen: input.origen,
    })
    return { ok: true, skipped: false, messageId: waMessageId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[whatsapp] excepción enviando texto a ${input.to}: ${msg}`)
    await logOutbound({
      phone: input.to,
      bodyPreview: input.text.slice(0, 300),
      payload: body,
      status: 'failed',
      errorMessage: msg,
      leadId: input.leadId,
      propertyId: input.propertyId,
      sentBy: input.sentBy,
      aiGenerated: input.aiGenerated,
      origen: input.origen,
    })
    return { ok: false, skipped: false, error: msg }
  }
}
