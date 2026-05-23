/**
 * Meta Conversions API (CAPI) — envío server-side de eventos.
 *
 * Por qué CAPI además del Pixel:
 *   - Ad blockers / Safari ITP / iOS 17 bloquean ~30-40% del Pixel.
 *   - Email/phone hasheados permiten mejor matching → mejor optimización.
 *   - No depende del navegador del usuario.
 *
 * Deduplicación con el Pixel:
 *   - El cliente genera un `event_id` (UUID v4) y lo usa tanto en el
 *     `fbq('track', 'Lead', {...}, { eventID })` como en el body que manda
 *     al endpoint /api/leads.
 *   - El endpoint pasa el mismo `event_id` al CAPI vía `eventId`.
 *   - Meta detecta el match y NO cuenta doble.
 *
 * Hashing:
 *   - Email/phone se hashean con SHA-256 antes de enviar (requisito Meta).
 *   - Phone debe estar normalizado (solo dígitos, sin '+').
 *   - Email se lowercase + trim.
 *
 * Test events:
 *   - Setear META_TEST_EVENT_CODE en env vars para validar en Events Manager
 *     → Test Events. NO setear en producción real.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api/
 */
import { createHash } from 'node:crypto'

const META_API_VERSION = 'v21.0'

export type CapiEventName = 'Lead' | 'Contact' | 'ViewContent' | 'CompleteRegistration'

export interface CapiUserData {
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
  city?: string | null
  countryCode?: string // 2-letter ISO, default 'ar'
  /** Cookies de Meta del cliente: _fbp y _fbc — mejoran match rate */
  fbp?: string | null
  fbc?: string | null
  /** IP y User-Agent del request original */
  clientIpAddress?: string | null
  clientUserAgent?: string | null
}

export interface CapiCustomData {
  contentIds?: string[]
  contentName?: string
  contentCategory?: string
  contentType?: string
  value?: number
  currency?: string
}

export interface SendCapiEventInput {
  eventName: CapiEventName
  /** UUID v4 compartido con el Pixel del cliente para dedupe */
  eventId: string
  eventSourceUrl: string // URL de la landing donde sucedió
  eventTimeUnixSeconds?: number // default Date.now() / 1000
  userData: CapiUserData
  customData?: CapiCustomData
  /** Si lo seteas, Meta lo marca como Test Event y no afecta optimización real */
  testEventCode?: string
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function hashEmail(email: string): string {
  return sha256(email.trim().toLowerCase())
}

function hashPhone(phone: string): string {
  // Meta espera solo dígitos, sin '+' ni espacios
  const digitsOnly = phone.replace(/\D/g, '')
  return sha256(digitsOnly)
}

function hashName(name: string): string {
  return sha256(name.trim().toLowerCase())
}

function buildHashedUserData(input: CapiUserData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.email) out.em = [hashEmail(input.email)]
  if (input.phone) out.ph = [hashPhone(input.phone)]
  if (input.firstName) out.fn = [hashName(input.firstName)]
  if (input.lastName) out.ln = [hashName(input.lastName)]
  if (input.city) out.ct = [sha256(input.city.trim().toLowerCase().replace(/\s+/g, ''))]
  if (input.countryCode) out.country = [sha256(input.countryCode.trim().toLowerCase())]
  // _fbp y _fbc no se hashean (van en plano por contrato Meta)
  if (input.fbp) out.fbp = input.fbp
  if (input.fbc) out.fbc = input.fbc
  if (input.clientIpAddress) out.client_ip_address = input.clientIpAddress
  if (input.clientUserAgent) out.client_user_agent = input.clientUserAgent
  return out
}

export interface CapiSendResult {
  ok: boolean
  eventsReceived?: number
  fbtraceId?: string
  error?: string
}

/**
 * Envía un evento a Meta CAPI. Idempotente vía `event_id` (Meta dedupea).
 *
 * Retorna `{ ok: false, error }` en lugar de lanzar — el caller decide
 * si reintentar o continuar. CRÍTICO: nunca dejar que un fallo de CAPI
 * tire el flow del lead (el lead ya está guardado en DB).
 */
export async function sendCapiEvent(input: SendCapiEventInput): Promise<CapiSendResult> {
  const pixelId = process.env.META_PIXEL_ID
  const accessToken = process.env.META_ACCESS_TOKEN
  if (!pixelId || !accessToken) {
    return { ok: false, error: 'META_PIXEL_ID o META_ACCESS_TOKEN no configurados' }
  }

  const eventTimeSec =
    input.eventTimeUnixSeconds ?? Math.floor(Date.now() / 1000)

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: input.eventName,
        event_time: eventTimeSec,
        event_id: input.eventId,
        event_source_url: input.eventSourceUrl,
        action_source: 'website',
        user_data: buildHashedUserData(input.userData),
        ...(input.customData
          ? {
              custom_data: {
                content_ids: input.customData.contentIds,
                content_name: input.customData.contentName,
                content_category: input.customData.contentCategory,
                content_type: input.customData.contentType,
                value: input.customData.value,
                currency: input.customData.currency,
              },
            }
          : {}),
      },
    ],
    ...(input.testEventCode ? { test_event_code: input.testEventCode } : {}),
  }

  // Timeout 3s. Es agresivo a propósito: este fetch se hace dentro del handler
  // del POST /api/leads y el usuario espera la respuesta. Si Meta tarda más
  // de 3s, abortamos y aceptamos perder el evento — el lead ya está en DB y
  // se mostró "Gracias" al usuario. Sin esto, en Netlify el proceso puede
  // congelarse después de la respuesta y el evento se pierde silenciosamente.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3_000)
  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )
    const json = (await res.json().catch(() => ({}))) as {
      events_received?: number
      fbtrace_id?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      return {
        ok: false,
        error: json.error?.message ?? `Meta CAPI ${res.status}`,
        fbtraceId: json.fbtrace_id,
      }
    }
    return {
      ok: true,
      eventsReceived: json.events_received,
      fbtraceId: json.fbtrace_id,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'CAPI timeout (>3s)' }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timeoutId)
  }
}
