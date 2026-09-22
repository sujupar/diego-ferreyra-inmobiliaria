/**
 * Lo único de los reels que habla con Instagram por la red.
 *
 * Misma versión de la API que el resto del repo (`v21.0`, ver
 * `lib/marketing/meta-campaign-builder.ts`): un módulo hablándole a otra versión
 * es la clase de diferencia que aparece meses después y nadie relaciona.
 *
 * ## Por qué la respuesta se lee como TEXTO y recién después se parsea
 *
 * Cuando algo se cae del lado de Meta o del gateway, la respuesta no es JSON:
 * es una página HTML de error. Con `res.json()` eso explota con
 * `Unexpected token '<'`, un mensaje que no dice absolutamente nada del problema
 * real y que ya hizo perder tiempo en este proyecto. Leyendo el texto primero,
 * el error conserva lo que Meta haya dicho.
 */

const API = 'https://graph.facebook.com/v21.0'

/** Error de Instagram con los códigos de Meta a mano, para poder traducirlo. */
export class ErrorInstagram extends Error {
  readonly httpStatus: number
  readonly code?: number
  readonly subcode?: number
  /** El cuerpo tal cual vino. Va aparte del mensaje legible, nunca en lugar de él. */
  readonly crudo: string

  constructor(mensaje: string, httpStatus: number, crudo: string, code?: number, subcode?: number) {
    super(mensaje)
    this.name = 'ErrorInstagram'
    this.httpStatus = httpStatus
    this.crudo = crudo
    this.code = code
    this.subcode = subcode
  }
}

/**
 * La cuenta con la que se publica.
 *
 * `META_INSTAGRAM_ACCOUNT_ID` es opcional: sin ella se resuelve desde la página,
 * igual que hace `getInstagramActorId()` en el constructor de campañas. Pero el
 * token no tiene respaldo posible — si falta, no hay nada que hacer.
 */
export function cuentaInstagram(): { igId: string; token: string } {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) throw new Error('Falta META_ACCESS_TOKEN')
  const igId = process.env.META_INSTAGRAM_ACCOUNT_ID
  if (!igId) throw new Error('Falta META_INSTAGRAM_ACCOUNT_ID')
  return { igId, token }
}

interface CuerpoDeError {
  error?: { message?: string; code?: number; error_subcode?: number }
}

/**
 * Traduce el error de Meta a algo que un asesor pueda entender.
 *
 * Los códigos no son adivinados: salen de probar contra la cuenta real el
 * 2026-09-22 (ver el spec). Lo que no se reconoce devuelve el mensaje de Meta,
 * nunca una cadena vacía ni un "error desconocido" a secas.
 */
export function mensajeLegible(e: unknown): string {
  if (!(e instanceof ErrorInstagram)) {
    return e instanceof Error ? e.message : 'Error inesperado al hablar con Instagram.'
  }
  // Verificados contra la cuenta: el 3 sale por /{ig}/messages y el 230 por
  // /{page}/messages. Los dos significan lo mismo para quien mira la pantalla.
  if (e.code === 3 || e.code === 230) {
    return 'Falta el permiso de mensajes privados de Instagram (pages_messaging). ' +
      'Hay que agregarlo al token en el panel de Meta; avisale al administrador.'
  }
  if (e.code === 100 && e.subcode === 33) {
    return 'Instagram no encontró ese contenido. Puede haber sido borrado.'
  }
  if (e.code === 190) {
    return 'El token de Meta dejó de ser válido. Hay que regenerarlo.'
  }
  if (e.code === 4 || e.code === 17 || e.httpStatus === 429) {
    return 'Instagram está limitando los pedidos por volumen. Se reintenta más tarde.'
  }
  if (e.httpStatus >= 500) {
    return 'Instagram no respondió bien en este momento. Se reintenta más tarde.'
  }
  return e.message
}

/** ¿Vale la pena reintentar, o va a fallar igual? */
export function esReintentable(e: unknown): boolean {
  if (!(e instanceof ErrorInstagram)) return false
  return e.httpStatus >= 500 || e.httpStatus === 429 || e.code === 4 || e.code === 17
}

export async function instagramFetch<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const { token } = cuentaInstagram()
  const base = ruta.startsWith('http') ? ruta : `${API}${ruta}`
  const separador = base.includes('?') ? '&' : '?'
  const url = `${base}${separador}access_token=${encodeURIComponent(token)}`

  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })

  // Texto primero, SIEMPRE: si Meta devolvió HTML de error, `res.json()` tiraría
  // "Unexpected token '<'" y se perdería la pista de lo que pasó.
  const texto = await res.text()

  if (!res.ok) {
    let cuerpo: CuerpoDeError = {}
    try {
      cuerpo = JSON.parse(texto) as CuerpoDeError
    } catch {
      // No era JSON: queda el texto crudo, que es justamente lo que interesa ver.
    }
    const detalle = cuerpo.error?.message ?? texto.slice(0, 300)
    throw new ErrorInstagram(
      `Instagram ${res.status}: ${detalle}`,
      res.status,
      texto,
      cuerpo.error?.code,
      cuerpo.error?.error_subcode,
    )
  }

  try {
    return JSON.parse(texto) as T
  } catch {
    throw new ErrorInstagram(
      'Instagram respondió algo que no es JSON (puede ser una página de error).',
      res.status,
      texto,
    )
  }
}
