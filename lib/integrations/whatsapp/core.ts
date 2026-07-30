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

/**
 * Timeout del POST a Meta. Sin esto una demora de Meta cuelga al llamador.
 * Default 8s para los envíos de fondo (cron de consultas de portales): ahí nadie
 * espera y cortar temprano es perder un aviso al asesor. El camino del recorrido
 * pasa 3s explícitamente, porque el visitante está esperando la respuesta.
 */
const WHATSAPP_TIMEOUT_DEFAULT_MS = 8000

export interface SendTemplateInput {
  to: string // E.164 sin '+', ej. 5491122334455
  templateName: string
  languageCode: string // ej. es_AR
  /** Parámetros de texto del body de la plantilla, en orden ({{1}}, {{2}}, ...). */
  bodyParams: string[]
  /** Sufijo dinámico del botón URL de la plantilla (ej. el token del recorrido). */
  urlButtonParam?: string
  /** Timeout del POST a Meta en ms. Default 8s (envíos de fondo). */
  timeoutMs?: number
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
  const components: Array<Record<string, unknown>> = [
    { type: 'body', parameters: input.bodyParams.map(text => ({ type: 'text', text })) },
  ]
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

/** Nunca lanza — devuelve el resultado para que el caller siga fire-and-forget. */
export async function sendWhatsappTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
  if (whatsappTestMode()) {
    console.log(
      `[whatsapp:test] (no enviado) to=${input.to} template=${input.templateName} params=${JSON.stringify(input.bodyParams)}`,
    )
    return { ok: true, skipped: true }
  }

  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`
  const body = buildTemplatePayload(input)

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
      messages?: { id: string }[]
      error?: { message?: string; code?: number }
    }
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`
      console.error(`[whatsapp] envío falló a ${input.to}: ${msg}`)
      return { ok: false, skipped: false, error: msg }
    }
    return { ok: true, skipped: false, messageId: json.messages?.[0]?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[whatsapp] excepción enviando a ${input.to}: ${msg}`)
    return { ok: false, skipped: false, error: msg }
  }
}
