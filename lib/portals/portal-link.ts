/**
 * Parser del link público de un aviso de portal → { portal, externalId }.
 *
 * Para qué sirve: `properties.import_external_id` guarda ese mismo id, así que
 * con el link pegado se encuentra la propiedad en el CRM sin scrapear nada
 * (verificado 2026-07-30: 21 de 23 propiedades activas lo tienen).
 *
 * Es deliberadamente TOLERANTE con lo que pega una persona: espacios alrededor,
 * link sin esquema, parámetros de tracking. Y deliberadamente ESTRICTO con lo
 * que devuelve: si no reconoce el portal o no encuentra un id de aviso creíble,
 * devuelve null y la UI muestra el mensaje de ayuda (nunca un error técnico).
 */

export interface PortalLink {
  portal: 'zonaprop' | 'argenprop'
  externalId: string
}

/** Los ids de aviso son largos (8 dígitos ZonaProp, 8 Argenprop). Este piso
 *  evita confundir un "2-ambientes-123" con un id real. */
const MIN_ID_DIGITS = 6

export function parsePortalLink(raw: string | null | undefined): PortalLink | null {
  const url = (raw ?? '').trim()
  if (!url) return null

  const portal: PortalLink['portal'] | null =
    /(^|\.|\/\/)zonaprop\.com\.ar/i.test(url) ? 'zonaprop'
    : /(^|\.|\/\/)argenprop\.com/i.test(url) ? 'argenprop'
    : null
  if (!portal) return null

  // Cortar querystring y hash: el id vive en el path.
  const path = url.split(/[?#]/)[0]
  // El id es el ÚLTIMO grupo largo de dígitos del path (ambos portales lo ponen
  // al final: "...-59439609.html" y "...--18191220").
  const matches = path.match(new RegExp(`\\d{${MIN_ID_DIGITS},}`, 'g'))
  if (!matches || matches.length === 0) return null

  return { portal, externalId: matches[matches.length - 1] }
}
