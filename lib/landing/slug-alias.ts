/**
 * Renombrar el enlace público de una propiedad SIN romper lo que ya apunta al viejo.
 *
 * POR QUÉ EXISTE: el slug se arma con el tipo de propiedad
 * (`casa-coghlan-roque-perez-3059-37ger2`) y queda congelado al publicar. Si el
 * tipo estaba mal cargado —Roque Pérez decía "departamento" siendo una casa— el
 * enlace público miente. Y corregirlo a secas mataría el link que ya vive dentro
 * de anuncios pagos, mensajes y mails: `/p/[slug]` resuelve por coincidencia
 * EXACTA, así que el viejo pasaría a dar 404 con pauta encima.
 *
 * La solución es que el slug viejo quede como ALIAS: sigue entrando y redirige
 * al nuevo, conservando los parámetros de seguimiento para no perder la
 * atribución de las conversiones que la campaña está pagando por medir.
 *
 * Módulo puro: se testea sin base ni navegador.
 */

export interface PlanDeRenombre {
  public_slug: string
  previous_slugs: string[]
}

/**
 * Qué hay que escribir para renombrar el enlace. Devuelve `null` cuando no hay
 * nada que hacer (mismo slug, o slug nuevo vacío).
 */
export function planRenombreDeSlug(
  actual: string | null | undefined,
  nuevo: string,
  previos: string[] = [],
): PlanDeRenombre | null {
  const destino = (nuevo ?? '').trim()
  if (!destino) return null
  if (destino === actual) return null

  const alias = new Set<string>()
  for (const p of previos) if (p && p.trim()) alias.add(p.trim())
  if (actual && actual.trim()) alias.add(actual.trim())
  // Si el slug nuevo venía siendo un alias, deja de serlo: un alias que apunta
  // a sí mismo es un bucle de redirección infinito.
  alias.delete(destino)

  return { public_slug: destino, previous_slugs: [...alias] }
}

/**
 * A dónde mandar a quien entra por un slug viejo.
 *
 * Conserva la query CRUDA (utm_*, fbclid, gclid…). Sin esto, cada visita que
 * llega por el enlace viejo pierde su origen y la conversión queda sin atribuir
 * — justo lo que la campaña paga por saber.
 */
export function destinoDeAlias(
  slugVigente: string,
  query: Record<string, string | string[] | undefined> = {},
): string {
  const partes: string[] = []
  for (const [clave, valor] of Object.entries(query)) {
    if (valor === undefined) continue
    for (const v of Array.isArray(valor) ? valor : [valor]) {
      partes.push(`${encodeURIComponent(clave)}=${encodeURIComponent(v)}`)
    }
  }
  const qs = partes.join('&')
  return qs ? `/p/${slugVigente}?${qs}` : `/p/${slugVigente}`
}
