/**
 * ¿Meta nos avisa de los comentarios de la Página de Facebook?
 *
 * Hacen falta dos cosas: que la APP escuche el objeto `page` (campo `feed`) en la
 * dirección de nuestro webhook, y que la PÁGINA tenga la app suscrita con `feed`.
 * Hasta el 2026-11-04 solo estaba la segunda, así que los comentarios de Facebook
 * no llegaban nunca. Módulo PURO: lee las respuestas de `/{app}/subscriptions` y
 * `/{página}/subscribed_apps`.
 */

function nombresDeCampos(fields: unknown): string[] {
  if (!Array.isArray(fields)) return []
  return fields
    .map((f) => (typeof f === 'string' ? f : typeof f === 'object' && f && 'name' in f ? String((f as { name: unknown }).name) : ''))
    .filter(Boolean)
}

export function escuchaComentariosDeFacebook(suscripcionesDeLaApp: unknown, direccion: string): boolean {
  if (!Array.isArray(suscripcionesDeLaApp)) return false
  return suscripcionesDeLaApp.some((s) => {
    if (typeof s !== 'object' || !s) return false
    const x = s as { object?: unknown; callback_url?: unknown; active?: unknown; fields?: unknown }
    return x.object === 'page' && x.callback_url === direccion && x.active !== false && nombresDeCampos(x.fields).includes('feed')
  })
}

/**
 * Los campos a mandar al dar de alta el objeto `page`. Meta REEMPLAZA la lista de ese
 * objeto: mandar solo `feed` dejaría de escuchar cualquier otro campo que ya tuviera.
 * Por eso se conservan los actuales y se suma `feed`.
 */
export function camposParaAlta(suscripcionesDeLaApp: unknown): string {
  const actual = Array.isArray(suscripcionesDeLaApp)
    ? suscripcionesDeLaApp.find((s) => typeof s === 'object' && s && (s as { object?: unknown }).object === 'page')
    : undefined
  const campos = nombresDeCampos((actual as { fields?: unknown } | undefined)?.fields)
  return (campos.includes('feed') ? campos : [...campos, 'feed']).join(',')
}

export function paginaRecibeFeed(appsDeLaPagina: unknown, appId: string): boolean {
  if (!Array.isArray(appsDeLaPagina)) return false
  return appsDeLaPagina.some((a) => {
    if (typeof a !== 'object' || !a) return false
    const x = a as { id?: unknown; subscribed_fields?: unknown }
    return String(x.id) === appId && nombresDeCampos(x.subscribed_fields).includes('feed')
  })
}
