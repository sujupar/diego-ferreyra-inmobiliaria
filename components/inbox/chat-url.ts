/**
 * La conversación abierta vive en la URL (`/inbox?tab=whatsapp&chat=<teléfono>`),
 * no en un `useState`.
 *
 * POR QUÉ IMPORTA, y no es un capricho de "URLs lindas": en un teléfono, el
 * gesto de volver (deslizar desde el borde en iOS, el gesto/botón de Android) es
 * el reflejo más automático que existe. Con la conversación en `useState`, ese
 * gesto navegaba a la página ANTERIOR y sacaba al usuario del Inbox entero,
 * perdiendo también los filtros que había puesto. Con la conversación en la URL,
 * abrir un chat empuja una entrada de historial y el mismo gesto simplemente
 * cierra el chat y devuelve la lista — que es lo que el usuario espera.
 *
 * Efectos que vienen de arrastre: el chat se puede compartir y sobrevive al
 * refresco (el "tirar para recargar" de Android ya no pierde la conversación).
 *
 * Estas dos funciones son PURAS a propósito: la parte difícil de esto no es
 * llamar a `history.pushState`, es armar bien la próxima URL sin pisar el resto
 * de los parámetros y decidir cómo se cierra. Eso se puede probar sin navegador.
 */

export const PARAM_CHAT = 'chat'
export const PARAM_TAB = 'tab'
export const TAB_WHATSAPP = 'whatsapp'

/**
 * La URL que corresponde a tener abierta la conversación `phone` (o ninguna,
 * con `null`).
 *
 * Conserva CUALQUIER otro parámetro que ya estuviera puesto —el deep link a un
 * lead (`?lead=`), lo que venga de una campaña— y fija `tab=whatsapp`, porque la
 * pestaña activa hoy vive en un `useState` de `InboxTabs` que se sincroniza con
 * ese parámetro: sin fijarlo, volver atrás a una URL con `chat=` aterrizaría en
 * la pestaña de Campañas con un chat "abierto" que no se ve por ningún lado.
 */
export function urlDelChat(pathname: string, search: string, phone: string | null): string {
  const params = new URLSearchParams(search)
  params.set(PARAM_TAB, TAB_WHATSAPP)
  if (phone) params.set(PARAM_CHAT, phone)
  else params.delete(PARAM_CHAT)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export type AccionAlCerrar = 'atras' | 'reemplazar'

/**
 * Cómo se cierra el chat desde el botón "volver" de la cabecera.
 *
 * Si la conversación se abrió DESDE la lista, cerrarla tiene que deshacer esa
 * misma entrada de historial (`atras`): así el botón de la pantalla y el gesto
 * del teléfono hacen exactamente lo mismo y el historial no se llena de pares
 * abrir/cerrar. Si en cambio se entró directo a la URL del chat (un link
 * compartido, un refresco), no hay ninguna entrada nuestra para deshacer y un
 * `atras` sacaría al usuario de la app: ahí se REEMPLAZA la URL por la de la
 * lista.
 */
export function accionAlCerrar(loAbrimosNosotros: boolean): AccionAlCerrar {
  return loAbrimosNosotros ? 'atras' : 'reemplazar'
}
