/**
 * Qué le pide el Inbox a `GET /api/leads`.
 *
 * Está acá afuera —y no inline en `InboxClient`— porque de la ventana de fechas
 * dependía una inconsistencia entre dos pantallas: el contador "Consultas sin
 * responder" (badge del menú y tarjeta de /inicio, `GET /api/leads/count`)
 * cuenta TODOS los leads en `status='new'`, sin límite de fecha, mientras que
 * el listado arrancaba con `days=30`. Un lead nuevo de hace más de 30 días
 * sumaba en el badge y no aparecía en la pantalla: la tarjeta decía 5, el Inbox
 * mostraba 4, y no había forma de saber cuál faltaba.
 *
 * El contador es el lado CORRECTO: una consulta de hace 40 días que nadie
 * contestó sigue sin responder, y ponerle una ventana lo haría mentir al revés
 * ("0 sin responder" con alguien esperando). Así que la ventana se saca del
 * OTRO lado — igual que ya se había decidido para la papelera, y por el mismo
 * motivo: "una papelera que esconde lo que guarda no sirve de nada"; una
 * bandeja de sin-responder que esconde las viejas, tampoco.
 *
 * Puro y testeado, como `awaiting.ts` y `filters.ts`.
 */

/** El estado por defecto del Inbox y el que cuenta el badge: "sin responder". */
export const ESTADO_SIN_RESPONDER = 'new'

/**
 * Diez años. `GET /api/leads` no tiene "sin límite": arma `since` como
 * `ahora - days`, así que la forma de decir "todo" es un número grande. Es el
 * mismo valor que ya usaba la papelera.
 */
export const DIAS_SIN_LIMITE = 3650

export interface OpcionesDeListado {
  view: 'active' | 'trash'
  /** Lo elegido en el selector de período. Se ignora donde la ventana no aplica. */
  days: number
  status: string
  source: string
  limit?: number
}

/**
 * `false` cuando la ventana de fechas NO se manda al servidor. La pantalla usa
 * esto para no mostrar un selector de período que no haría nada — un control
 * que no cambia lo que se ve es otra forma de mentir.
 */
export function usaVentanaDeFechas(view: 'active' | 'trash', status: string): boolean {
  if (view === 'trash') return false
  return status !== ESTADO_SIN_RESPONDER
}

/** Los parámetros exactos del pedido, listos para `fetch('/api/leads?' + …)`. */
export function parametrosDeListado(opts: OpcionesDeListado): URLSearchParams {
  const params = new URLSearchParams({ limit: String(opts.limit ?? 200) })

  if (opts.view === 'trash') {
    // La papelera NO hereda el filtro de días: un lead creado hace 6 meses y
    // borrado ayer no aparecía con el rango por defecto, y sin verlo no se
    // podía restaurar.
    params.set('trashed', 'true')
    params.set('days', String(DIAS_SIN_LIMITE))
    return params
  }

  params.set('days', String(usaVentanaDeFechas(opts.view, opts.status) ? opts.days : DIAS_SIN_LIMITE))
  if (opts.status) params.set('status', opts.status)
  if (opts.source) params.set('source', opts.source)
  return params
}
