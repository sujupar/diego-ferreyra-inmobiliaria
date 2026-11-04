/**
 * El enlace a la landing que va en el privado del reel.
 *
 * Lleva marcas de origen para que en las métricas se vea cuántas visitas y
 * registros trae cada reel. Sigue la convención de `lib/landing/utm.ts`: la
 * campaña es la de la propiedad (`propiedad_<slug>`), así lo que viene de un
 * reel suma a la misma propiedad que la campaña de Meta; el reel concreto va en
 * `utm_content`. `LandingVisitTracker` ya lee estas marcas al abrir la página.
 *
 * Módulo PURO.
 */
export function enlaceDelReel(
  baseUrl: string,
  slug: string,
  reelId: string,
  plataforma: 'instagram' | 'facebook' = 'instagram',
): string {
  const base = baseUrl.replace(/\/+$/, '')
  const marcas = new URLSearchParams({
    // De qué red vino quien comentó: el mismo reel puede estar en Instagram y en Facebook.
    utm_source: plataforma,
    utm_medium: 'reel',
    utm_campaign: `propiedad_${slug}`,
    utm_content: `reel_${reelId.slice(0, 8)}`,
  })
  return `${base}/p/${encodeURIComponent(slug)}?${marcas.toString()}`
}

/** Hosts de WhatsApp: abren un chat, no una página, y no leen marcas de origen. */
const HOSTS_WHATSAPP = new Set(['wa.me', 'api.whatsapp.com', 'whatsapp.com', 'www.whatsapp.com', 'web.whatsapp.com'])

/** ¿A este enlace se le pueden agregar marcas de origen? (host exacto, nunca `includes`). */
export function llevaMarcas(enlace: string): boolean {
  try {
    const url = new URL(enlace)
    return url.protocol === 'https:' && !HOSTS_WHATSAPP.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

/**
 * El enlace de un comentario "personalizado" de Publicaciones, con las marcas de
 * origen (pedido del dueño, 2026-11-04: todo lo que entra tiene que poder medirse).
 * No es de una propiedad, así que la campaña es `publicaciones` y el reel va en
 * `utm_content`. Una marca que la persona ya escribió en el enlace se respeta.
 * A WhatsApp no se le agrega nada: no las lee y no hay página donde medirlas.
 */
export function enlacePersonalizadoConMarcas(
  enlace: string,
  reelId: string,
  plataforma: 'instagram' | 'facebook',
): string {
  if (!llevaMarcas(enlace)) return enlace
  const url = new URL(enlace)
  const marcas: Record<string, string> = {
    utm_source: plataforma,
    utm_medium: 'reel',
    utm_campaign: 'publicaciones',
    utm_content: `reel_${reelId.slice(0, 8)}`,
  }
  for (const [clave, valor] of Object.entries(marcas)) {
    if (!url.searchParams.has(clave)) url.searchParams.set(clave, valor)
  }
  return url.toString()
}
