import { PortalAdapterError } from '../types'
import type { ApCredentials } from '../credentials'

export interface ApPublishResponse {
  ok: boolean
  visibilidadIds: string[]
  errorMessage?: string
  raw: unknown
}

/** Codifica un Record<string,string> a application/x-www-form-urlencoded. */
export function encodeForm(form: Record<string, string>): string {
  return Object.entries(form)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

/**
 * Parsea la respuesta JSON de PublicarIntranet.
 * CONTRACT ASSUMPTION: éxito = colección con ids de visibilidad; error = envelope
 * con Error/Mensaje. El probe corrige el shape real acá.
 */
export function parseApResponse(json: unknown): ApPublishResponse {
  // Caso éxito: array de objetos con id (visibilidades creadas)
  if (Array.isArray(json)) {
    const ids = json
      .map(x => (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : null))
      .filter((x): x is string => !!x)
    return { ok: ids.length > 0, visibilidadIds: ids, raw: json }
  }
  // Caso envelope de error
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const errFlag = o.Error === true || o.error === true || typeof o.Mensaje === 'string' || typeof o.mensaje === 'string'
    const msg = (o.Mensaje ?? o.mensaje ?? o.Message ?? o.message) as string | undefined
    // Algunas respuestas exitosas pueden venir como objeto con una colección anidada.
    const nested = (o.visibilidades ?? o.Visibilidades ?? o.ids ?? o.Ids) as unknown
    if (Array.isArray(nested)) {
      const ids = nested.map(x => String((x as { id?: unknown })?.id ?? x)).filter(Boolean)
      return { ok: ids.length > 0, visibilidadIds: ids, raw: json }
    }
    if (errFlag) return { ok: false, visibilidadIds: [], errorMessage: msg ?? 'Error de Argenprop', raw: json }
  }
  return { ok: false, visibilidadIds: [], errorMessage: 'Respuesta no reconocida', raw: json }
}

/**
 * POST a PublicarIntranet con el form aplanado. Transporte form-urlencoded;
 * `?contentType=json` (ya en la URL) hace que la respuesta venga en JSON.
 */
export async function apPublish(form: Record<string, string>, creds: ApCredentials): Promise<ApPublishResponse> {
  if (!creds.publishUrl || !creds.usr || !creds.psd) {
    throw new PortalAdapterError('Missing Argenprop credentials', 'argenprop', 'auth', false)
  }
  const res = await fetch(creds.publishUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': creds.userAgent,
    },
    body: encodeForm(form),
  })
  const text = await res.text()
  if (!res.ok) {
    const retryable = res.status >= 500 || res.status === 429
    throw new PortalAdapterError(
      `Argenprop ${res.status}: ${text.slice(0, 500)}`,
      'argenprop',
      res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      retryable,
    )
  }
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  const parsed = parseApResponse(json)
  if (!parsed.ok) {
    throw new PortalAdapterError(
      `Argenprop rechazó la publicación: ${parsed.errorMessage ?? text.slice(0, 300)}`,
      'argenprop', 'unknown', false,
    )
  }
  return parsed
}
