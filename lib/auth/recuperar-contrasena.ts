/**
 * Reglas de la recuperación de contraseña. Módulo puro: sin red ni base, para que
 * se pueda probar entero y lo usen igual la ruta de API y las dos pantallas.
 * Spec: docs/superpowers/specs/2026-11-12-recuperar-contrasena-design.md
 */

/** Dominio de producción. Es el destino del enlace cuando la base configurada no sirve. */
const BASE_PRODUCCION = 'https://inmodf.com.ar'

export const RUTA_RESTABLECER = '/restablecer-contrasena'

/** Cuántos enlaces puede recibir un mismo email dentro de la ventana. */
export const LIMITE_ENVIOS = 3
export const VENTANA_LIMITE_MS = 15 * 60 * 1000

export const MIN_CARACTERES = 8
/**
 * Supabase guarda la contraseña con bcrypt, que usa solo los primeros 72 BYTES y
 * descarta el resto en silencio: una contraseña de 80 caracteres "funcionaría"
 * con cualquier final. Mejor avisarlo que dejar a alguien con una falsa seguridad.
 */
export const MAX_CARACTERES = 72

const MENSAJE_ENLACE_INVALIDO = 'Este enlace venció o ya se usó.'

export function normalizarEmail(crudo: string): string | null {
  const email = crudo.trim().toLowerCase()
  if (email.length === 0 || email.length > 254) return null
  // Validación de forma, no de existencia: alcanza para no mandarle basura a Supabase.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

/**
 * Enlace que va en el email. La base sale de la configuración, NUNCA del Host del
 * request: si saliera del request, cualquiera podría pedir un reset para otra
 * persona con un Host falso y el email le llevaría el token a un dominio ajeno.
 * Por la misma razón una base que no sea https cae al dominio de producción.
 */
export function construirEnlaceRestablecer(base: string, tokenHash: string): string {
  const limpia = base.trim().replace(/\/+$/, '')
  const segura = /^https:\/\/[^\s/]+$/.test(limpia) ? limpia : BASE_PRODUCCION
  const params = new URLSearchParams({ token_hash: tokenHash, type: 'recovery' })
  return `${segura}${RUTA_RESTABLECER}?${params.toString()}`
}

/** Devuelve el error para mostrar, o null si la contraseña sirve. */
export function validarNuevaContrasena(contrasena: string, repetida: string): string | null {
  // Una "ñ" puede llegar como un carácter o como "n" + tilde suelta (macOS, copiar y
  // pegar). Sin normalizar, dos contraseñas idénticas a la vista no coincidirían y el
  // largo se contaría de más.
  const a = contrasena.normalize('NFC')
  const b = repetida.normalize('NFC')
  if (a.trim().length === 0) return 'La contraseña no puede ser solo espacios.'
  const largo = [...a].length
  if (largo < MIN_CARACTERES) return `La contraseña tiene que tener al menos ${MIN_CARACTERES} caracteres.`
  if (new TextEncoder().encode(a).length > MAX_CARACTERES) {
    return `La contraseña puede tener como máximo ${MAX_CARACTERES} caracteres.`
  }
  if (a !== b) return 'Las contraseñas no coinciden.'
  return null
}

/** `enviosRecientes` = enlaces ya mandados a ese email dentro de la ventana. */
export function superaLimiteDeEnvios(enviosRecientes: number): boolean {
  return enviosRecientes >= LIMITE_ENVIOS
}

/**
 * Forma del token antes de mandárselo a Supabase. Supabase genera hexadecimal; se
 * acepta también base64url por si cambia el formato, pero nunca algo con símbolos
 * o de largo absurdo.
 */
export function esTokenConForma(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(token)
}

/**
 * Traduce el error de Supabase cuando el enlace no sirve. Devuelve null si el error es
 * de otro tipo (red caída, servidor): en ese caso NO hay que decirle a la persona que
 * su enlace venció, porque puede reintentar con el mismo.
 */
export function mensajeEnlaceInvalido(mensajeSupabase: string): string | null {
  if (/expired|invalid|not found|already been used|otp/i.test(mensajeSupabase)) return MENSAJE_ENLACE_INVALIDO
  return null
}
