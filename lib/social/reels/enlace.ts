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
export function enlaceDelReel(baseUrl: string, slug: string, reelId: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  const marcas = new URLSearchParams({
    utm_source: 'instagram',
    utm_medium: 'reel',
    utm_campaign: `propiedad_${slug}`,
    utm_content: `reel_${reelId.slice(0, 8)}`,
  })
  return `${base}/p/${encodeURIComponent(slug)}?${marcas.toString()}`
}
