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

export function tokenInstagram(): string {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) {
    throw new Error(
      'La conexión con Instagram no está configurada en el sistema. ' +
      'Avisale al administrador (falta META_ACCESS_TOKEN).',
    )
  }
  return token
}

/**
 * La cuenta de Instagram con la que se publica.
 *
 * `META_INSTAGRAM_ACCOUNT_ID` es OPCIONAL: si no está, se averigua sola desde la
 * página de Facebook conectada, igual que hace `getInstagramActorId()` en el
 * constructor de campañas. Esto salió del QA — sin la variable cargada, la
 * pantalla moría con "Falta META_INSTAGRAM_ACCOUNT_ID", que no le dice nada a un
 * asesor y obligaba a configurar algo que el sistema puede deducir.
 *
 * Solo se cachea el ÉXITO: un fallo pasajero de red no puede dejar la cuenta
 * fijada en "no hay" hasta el próximo despliegue.
 */
let cuentaCacheada: string | null = null

export async function cuentaInstagram(): Promise<{ igId: string; token: string }> {
  const token = tokenInstagram()
  if (cuentaCacheada) return { igId: cuentaCacheada, token }

  const delEntorno = process.env.META_INSTAGRAM_ACCOUNT_ID
  if (delEntorno) {
    cuentaCacheada = delEntorno
    return { igId: delEntorno, token }
  }

  const res = await fetch(
    `${API}/me/accounts?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`,
  )
  const texto = await res.text()
  let cuerpo: { data?: Array<{ instagram_business_account?: { id?: string } }> } = {}
  try {
    cuerpo = JSON.parse(texto) as typeof cuerpo
  } catch {
    // Cae al error de abajo con el mensaje entendible.
  }

  const id = cuerpo.data?.find((p) => p.instagram_business_account?.id)
    ?.instagram_business_account?.id
  if (!id) {
    throw new Error(
      'No se pudo identificar la cuenta de Instagram de la inmobiliaria. ' +
      'Avisale al administrador (revisar el token de Meta o cargar META_INSTAGRAM_ACCOUNT_ID).',
    )
  }

  cuentaCacheada = id
  return { igId: id, token }
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
  // El token, no la cuenta: pedir la cuenta acá sería recursivo (la consulta que
  // la averigua pasa por este mismo camino).
  return llamarConToken<T>(ruta, init, tokenInstagram())
}

/* -------------------------------------------------------------------------- */
/*  La página: por donde salen los mensajes privados                          */
/* -------------------------------------------------------------------------- */

/*
 * Los privados NO pueden salir por /{ig}/messages con el token de sistema: Meta
 * responde "(#3) Application does not have the capability to make this API call"
 * con CUALQUIER token (verificado el 2026-09-23 con dos tokens que tienen
 * pages_messaging). Ese camino es el de "Instagram API con inicio de sesión de
 * Instagram", que esta app no usa. El que sí funciona es el de la plataforma de
 * Messenger: /{página}/messages con el token DE LA PÁGINA conectada a la cuenta.
 * Con ese camino el error de un comentario inventado pasa a ser "parámetro
 * inválido" (1893060): el permiso ya no frena.
 */
let paginaCacheada: { pageId: string; pageToken: string } | null = null

/** Solo para las pruebas: el caché vive en el módulo. */
export function olvidarPaginaCacheada(): void {
  paginaCacheada = null
}

/**
 * La página de Facebook conectada a la cuenta de Instagram, con su token.
 * Se pide una vez y se guarda; solo se guarda el ÉXITO, como con la cuenta.
 */
export async function paginaDeLaCuenta(): Promise<{ pageId: string; pageToken: string }> {
  if (paginaCacheada) return paginaCacheada
  const { igId } = await cuentaInstagram()
  const cuerpo = await instagramFetch<{
    data?: Array<{ id?: string; access_token?: string; instagram_business_account?: { id?: string } }>
  }>('/me/accounts?fields=id,access_token,instagram_business_account')
  const pagina = cuerpo.data?.find((p) => p.instagram_business_account?.id === igId && p.id && p.access_token)
  if (!pagina?.id || !pagina.access_token) {
    throw new Error(
      'No se encontró la página de Facebook conectada a la cuenta de Instagram, y los mensajes ' +
      'privados salen por ella. Avisale al administrador.',
    )
  }
  paginaCacheada = { pageId: pagina.id, pageToken: pagina.access_token }
  return paginaCacheada
}

/** Igual que `instagramFetch`, pero con el token de la página. */
export async function paginaFetch<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const { pageToken } = await paginaDeLaCuenta()
  try {
    return await llamarConToken<T>(ruta, init, pageToken)
  } catch (e) {
    // Un token de página vencido o revocado (190 / 401) NO puede quedar guardado:
    // si no, todos los privados fallarían hasta el próximo deploy. Se descarta y
    // el próximo envío vuelve a pedir la página y un token fresco.
    if (e instanceof ErrorInstagram && (e.code === 190 || e.httpStatus === 401)) paginaCacheada = null
    throw e
  }
}

async function llamarConToken<T>(ruta: string, init: RequestInit, token: string): Promise<T> {
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
