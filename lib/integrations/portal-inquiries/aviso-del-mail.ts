/**
 * El aviso que trae el mail del portal: su foto y, en ZonaProp, su enlace real.
 * Sirve para que el equipo RECONOZCA el aviso al conectarlo con nuestra
 * propiedad (spec 2026-10-30-conectar-avisos).
 *
 * Todo esto viene de un mail de terceros. Por eso:
 *  - solo `https` y el host EXACTO del portal (nunca `includes`/`startsWith`:
 *    `imgar.zonapropcdn.com.evil.com` pasaría cualquiera de los dos);
 *  - el enlace de ZonaProp se acepta solo si lleva a una ficha
 *    `/propiedades/clasificado/…html`, y se guarda sin query ni ancla (los `utm_`
 *    son del mail, no del aviso).
 *
 * ZonaProp no pone el enlace del aviso en el mail: pone redireccionadores de
 * clic (`link.zonaprop.com.ar/ls/click`), uno por botón (logo, aviso, panel,
 * responder). Se siguen de a uno SIN descargar el destino (`redirect: 'manual'`)
 * hasta encontrar el del aviso. NUNCA se toca `/wf/open`: es el píxel que le
 * avisa al portal que el mail se abrió.
 */

/** Pocos: cada GET a un redireccionador cuenta como un clic del destinatario. */
const MAX_ENLACES_DE_CLIC = 4

/**
 * Botones que NO se siguen nunca: con un redireccionador, el GET ya ejecuta la
 * acción en el portal (darse de baja, cambiar preferencias), aunque no se baje
 * la página de destino.
 */
const TEXTO_PELIGROSO = /baja|desuscrib|unsubscribe|preferencia|configur|dejar de recibir/i

/** `&amp;` y compañía, tal como vienen dentro de un atributo HTML. */
function desescapar(valor: string): string {
  return valor.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/')
}

function atributos(html: string, nombre: 'src' | 'href'): string[] {
  const re = new RegExp(`\\b${nombre}\\s*=\\s*["']([^"']+)["']`, 'gi')
  return [...(html ?? '').matchAll(re)].map((m) => desescapar(m[1].trim()))
}

function leerUrl(valor: string): URL | null {
  try { return new URL(valor) } catch { return null }
}

/** "…/290x180/123.jpg" → 290*180; sin medida, 0. */
function superficie(url: URL): number {
  const m = /\/(\d+)x(\d+)\//.exec(url.pathname)
  return m ? Number(m[1]) * Number(m[2]) : 0
}

/** La foto principal del aviso, o null si el mail no trae una confiable. */
export function fotoDelAviso(portal: string, html: string): string | null {
  const candidatas = atributos(html, 'src')
    .map(leerUrl)
    .filter((u): u is URL => u !== null && u.protocol === 'https:')

  if (portal === 'zonaprop') {
    const delAviso = candidatas.filter((u) => u.hostname === 'imgar.zonapropcdn.com' && u.pathname.startsWith('/avisos/'))
    if (delAviso.length === 0) return null
    // El mail trae la misma foto en dos tamaños: la más grande se ve mejor.
    return delAviso.reduce((mejor, u) => (superficie(u) > superficie(mejor) ? u : mejor)).toString()
  }
  if (portal === 'argenprop') {
    // Los íconos del mail viven en /content/emails/; la foto del aviso en /static-content/.
    const foto = candidatas.find((u) => u.hostname === 'www.argenprop.com' && u.pathname.startsWith('/static-content/'))
    return foto ? foto.toString() : null
  }
  return null
}

/**
 * Los redireccionadores de clic del mail de ZonaProp, sin repetir. Primero el
 * que más se repite: en el mail real el del aviso aparece 7 veces (foto, título,
 * botones) y el logo o el panel, una. Así casi siempre basta un solo pedido.
 * Los de "darse de baja" y "preferencias" se descartan por el texto del enlace.
 */
export function enlacesDeClicZonaprop(html: string): string[] {
  const veces = new Map<string, number>()
  const prohibidos = new Set<string>()
  for (const m of (html ?? '').matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const valor = desescapar(m[1].trim())
    const u = leerUrl(valor)
    // El mail los trae en http: es el redireccionador, no el destino (el destino sí se exige https).
    if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) continue
    if (u.hostname !== 'link.zonaprop.com.ar' || u.pathname !== '/ls/click') continue
    const texto = m[2].replace(/<[^>]*>/g, ' ')
    if (TEXTO_PELIGROSO.test(texto)) { prohibidos.add(valor); continue }
    veces.set(valor, (veces.get(valor) ?? 0) + 1)
  }
  // `sort` es estable: a igual cantidad, el orden del mail.
  return [...veces.entries()]
    .filter(([valor]) => !prohibidos.has(valor))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENLACES_DE_CLIC)
    .map(([valor]) => valor)
}

/** El destino de un clic, si es la ficha de un aviso; sin `utm_` ni ancla. */
export function avisoZonapropLimpio(destino: string): string | null {
  const u = leerUrl(destino)
  if (!u || u.protocol !== 'https:' || u.hostname !== 'www.zonaprop.com.ar') return null
  if (!/^\/propiedades\/clasificado\/[^/]+\.html$/.test(u.pathname)) return null
  return `${u.origin}${u.pathname}`
}

type Red = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Sigue los clics del mail hasta el del aviso. Un solo techo de tiempo para
 * todo (la ingesta corre dentro del límite de Netlify). Nunca lanza: sin enlace,
 * la consulta entra igual.
 */
export async function resolverAvisoZonaprop(
  html: string,
  opciones: { fetch: Red; techoMs: number },
): Promise<string | null> {
  const enlaces = enlacesDeClicZonaprop(html)
  if (enlaces.length === 0) return null
  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), opciones.techoMs)
  try {
    for (const enlace of enlaces) {
      if (corte.signal.aborted) return null
      try {
        const res = await opciones.fetch(enlace, { redirect: 'manual', signal: corte.signal })
        const destino = res.headers.get('location')
        const aviso = destino ? avisoZonapropLimpio(destino) : null
        if (aviso) return aviso
      } catch {
        if (corte.signal.aborted) return null
        // Un enlace que falla no impide probar el siguiente.
      }
    }
    return null
  } finally {
    clearTimeout(reloj)
  }
}
