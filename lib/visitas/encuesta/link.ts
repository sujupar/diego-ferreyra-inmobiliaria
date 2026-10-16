/**
 * El link de la encuesta (spec §4.10 + §11): un código opaco por visita, sin datos personales en
 * la URL (como los hidden fields de Typeform, pero resueltos por el servidor — patrón de /v/<token>).
 * Puro: el azar entra por parámetro (crypto.randomBytes en el servidor), así se testea sin red.
 */
export const LARGO_TOKEN = 22
export const VIGENCIA_DIAS = 30
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/

/** 16 bytes (128 bits) → 22 caracteres base64url. Otra cantidad sería un token más débil: falla. */
export function tokenDesdeBytes(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('El token de la encuesta se arma con 16 bytes')
  return Buffer.from(bytes).toString('base64url')
}

/** Validar la FORMA antes de tocar la base: un token inventado no gasta una consulta. */
export function esTokenEncuesta(v: unknown): v is string {
  return typeof v === 'string' && TOKEN_RE.test(v)
}

export function vencimientoDesde(ahora: Date): string {
  return new Date(ahora.getTime() + VIGENCIA_DIAS * 86_400_000).toISOString()
}

/** Fail-closed: una fecha ilegible cuenta como vencida. */
export function estaVencida(expiresAt: string, ahora: Date): boolean {
  const t = Date.parse(expiresAt)
  return !Number.isFinite(t) || t <= ahora.getTime()
}

export function urlDeLaEncuesta(token: string, base?: string | null): string {
  const b = (base?.trim() || 'https://inmodf.com.ar').replace(/\/+$/, '')
  return `${b}/encuesta/${token}`
}
