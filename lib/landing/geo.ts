/**
 * País del visitante a partir del header de geolocalización que agrega el CDN
 * de Netlify (`x-nf-geo`). Lo usa el selector de teléfono de la landing
 * (`PhoneField`) para arrancar en el país correcto sin que la persona tenga
 * que buscarlo a mano.
 *
 * Netlify documenta el shape de dos formas distintas según la superficie
 * (Edge Functions `context.geo` vs. el header crudo de Functions/runtime), y
 * en la práctica el HEADER puede venir como:
 *   1) JSON plano:            {"country":{"code":"AR","name":"Argentina"},...}
 *   2) JSON envuelto en "geo": {"geo":{"country":{"code":"AR",...}},...}
 *   3) Base64 de cualquiera de las dos formas anteriores.
 * Por eso `extraerCountryCode` prueba las tres combinaciones. Local (dev, o
 * cualquier hosting que no sea Netlify) no manda este header — devolver
 * `null` ahí es el camino esperado, nunca un error.
 */

const ISO2 = /^[A-Za-z]{2}$/

function codigoDesdeJson(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  // Forma 1: {"country":{"code":"AR"}}
  const directo = (obj.country as { code?: unknown } | undefined)?.code
  if (typeof directo === 'string' && ISO2.test(directo)) return directo.toUpperCase()
  // Forma 2: {"geo":{"country":{"code":"AR"}}}
  const geo = obj.geo as Record<string, unknown> | undefined
  const anidado = (geo?.country as { code?: unknown } | undefined)?.code
  if (typeof anidado === 'string' && ISO2.test(anidado)) return anidado.toUpperCase()
  return null
}

function intentarParsear(raw: string): string | null {
  try {
    return codigoDesdeJson(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Extrae el código ISO 3166-1 alpha-2 del header `x-nf-geo`. Nunca lanza:
 * cualquier forma inesperada devuelve `null` (el caller cae a 'AR').
 */
export function extraerCountryCode(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null
  const value = headerValue.trim()
  if (!value) return null

  // 1) JSON plano (sin decodificar).
  const plano = intentarParsear(value)
  if (plano) return plano

  // 2) Base64 de ese mismo JSON.
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8')
    const desdeBase64 = intentarParsear(decoded)
    if (desdeBase64) return desdeBase64
  } catch {
    /* no era base64 válido — sigue al fallback */
  }

  return null
}

/** País por defecto cuando no hay señal de geolocalización (local, o el header no matchea). */
export const GEO_COUNTRY_FALLBACK = 'AR'

export function resolveGeoCountry(headerValue: string | null | undefined): string {
  return extraerCountryCode(headerValue) ?? GEO_COUNTRY_FALLBACK
}
