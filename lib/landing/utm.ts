/**
 * E1.4 — Base UTM de la landing + construcción de la landing_url.
 *
 * La landing MATERIALIZA su base UTM al publicar (source/medium/campaign +
 * base_url), congelada. La campaña Meta (E2.4) la LEE en vez de hardcodear los
 * UTMs, y completa los placeholders dinámicos de Meta ({{ad.id}}, {{placement}})
 * + los macros fb_* que llenan landing_page_visits.fb_* (hoy quedan vacíos).
 *
 * Un solo lugar define la convención → no se desincroniza entre landing y campaña.
 */

export interface UtmBase {
  utm_source: string       // 'meta'
  utm_medium: string       // 'paid_social'
  utm_campaign: string     // 'propiedad_<slug>' o 'altovalor_<slug>'
  base_url: string         // '<appUrl>/p/<slug>'
}

export type LandingFunnelType = 'venta_propiedad' | 'alto_valor'

/**
 * Base UTM que se congela al publicar la landing. El prefijo de campaña
 * distingue alto valor (D2: mismo sistema, distinto tratamiento y prefijo).
 */
export function buildUtmBase(appUrl: string, slug: string, funnelType: LandingFunnelType): UtmBase {
  const prefix = funnelType === 'alto_valor' ? 'altovalor' : 'propiedad'
  return {
    utm_source: 'meta',
    utm_medium: 'paid_social',
    utm_campaign: `${prefix}_${slug}`,
    base_url: `${appUrl.replace(/\/+$/, '')}/p/${slug}`,
  }
}

interface BuildUrlOpts {
  /**
   * 'meta'    → agrega placeholders dinámicos de Meta ({{ad.id}}/{{placement}})
   *             + macros fb_* (para poblar landing_page_visits.fb_*). Es la URL
   *             que va al AdCreative.
   * 'preview' → URL limpia sin placeholders (para el smoke test GET 200 y para
   *             previsualizar).
   */
  mode: 'meta' | 'preview'
}

/**
 * Construye la landing_url final desde la base UTM. En modo 'meta' agrega los
 * macros dinámicos SIN url-encodear las llaves (Meta las requiere literales).
 */
export function buildLandingUrl(base: UtmBase, opts: BuildUrlOpts): string {
  const params = new URLSearchParams({
    utm_source: base.utm_source,
    utm_medium: base.utm_medium,
    utm_campaign: base.utm_campaign,
  })

  if (opts.mode === 'meta') {
    // Placeholders que Meta reemplaza al servir el anuncio.
    params.set('utm_content', '{{ad.id}}')
    params.set('utm_term', '{{placement}}')
    // Macros fb_* → llenan landing_page_visits.fb_* (atribución por anuncio,
    // hoy ciega). Meta los reemplaza por los ids reales.
    params.set('fb_campaign_id', '{{campaign.id}}')
    params.set('fb_adset_id', '{{adset.id}}')
    params.set('fb_ad_id', '{{ad.id}}')
    params.set('fb_placement', '{{placement}}')
  }

  const qs = params
    .toString()
    // Meta requiere las llaves {{ }} literales, no url-encoded.
    .replaceAll('%7B%7B', '{{')
    .replaceAll('%7D%7D', '}}')
    .replaceAll('%7B', '{')
    .replaceAll('%7D', '}')

  return `${base.base_url}?${qs}`
}
