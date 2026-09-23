/**
 * Los mensajes privados de Instagram.
 *
 * ## El botón lleva escondido el identificador del reel
 *
 * Cuando la persona toca el botón, Instagram nos avisa con el identificador de
 * SU CHAT. Ese identificador no siempre es el mismo que el del comentario que
 * escribió antes, así que cruzar personas para saber de qué propiedad estaba
 * hablando es frágil — y equivocarse significa mandarle la landing de otra
 * propiedad.
 *
 * Por eso el dato viaja adentro del botón: cuando vuelve, sabemos exactamente
 * de qué reel salió, sin adivinar nada.
 *
 * ## Los límites no son cosméticos
 *
 * Instagram RECHAZA el mensaje entero si el título del botón se pasa de 20
 * caracteres. No lo recorta: lo rechaza. La persona no recibe nada y el asesor
 * no se entera. Es la misma lección del tope de 1024 caracteres de las
 * plantillas de WhatsApp, ya documentada en CLAUDE.md: pasarse no degrada el
 * mensaje, lo hace desaparecer.
 */
import { ErrorInstagram, paginaDeLaCuenta, paginaFetch } from './client'

/** Prefijo del dato del botón. Distingue lo nuestro de cualquier otra cosa. */
export const DATO_BOTON = 'reel:'

/** Límites de Instagram. Pasarse hace que el mensaje sea RECHAZADO, no recortado. */
const MAX_TITULO_BOTON = 20
const MAX_TEXTO = 1000

export function datoDelBoton(reelId: string): string {
  return `${DATO_BOTON}${reelId}`
}

/** El identificador del reel, o `null` si el dato no es nuestro. */
export function leerDatoDelBoton(dato: string | null | undefined): string | null {
  if (!dato || !dato.startsWith(DATO_BOTON)) return null
  const id = dato.slice(DATO_BOTON.length)
  return id.length > 0 ? id : null
}

/**
 * Recorta cuidando los enlaces.
 *
 * Una URL cortada al medio no es un enlace: es texto roto que no abre nada. Si
 * hay que ceder caracteres, se ceden del texto de antes y el enlace se conserva
 * entero. Misma regla que el acortador de WhatsApp.
 */
function recortarCuidandoEnlaces(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto

  const enlaces = texto.match(/https?:\/\/\S+/g) ?? []
  if (enlaces.length === 0) return texto.slice(0, maximo).trimEnd()

  // Se conserva el último enlace (el que importa: el de la landing) y se recorta
  // todo lo que va antes hasta que entre.
  const enlace = enlaces[enlaces.length - 1]
  const disponible = maximo - enlace.length - 1
  if (disponible <= 0) return enlace.slice(0, maximo)

  const antes = texto.slice(0, texto.lastIndexOf(enlace)).trimEnd()
  return `${antes.slice(0, disponible).trimEnd()}\n${enlace}`
}

/** Instagram corta el texto de un mensaje con botón en 640 caracteres. */
export const MAX_TEXTO_CON_BOTON = 640

/**
 * El privado que va HOY: el texto y un botón que abre la landing directo.
 *
 * Por qué no el de respuesta rápida (`mandarPrivadoConBoton`, abajo): con el
 * acceso ESTÁNDAR de la app, Meta deja mandar el privado de un comentario, pero
 * no avisa cuando la persona toca un botón de respuesta ni deja escribirle un
 * segundo mensaje ("(#200) La app no tiene acceso avanzado a
 * instagram_manage_messages y el usuario no tiene ningún rol en ella",
 * verificado 2026-09-23). Así, el enlace tiene que viajar en el PRIMER mensaje.
 * Además es un paso menos para la persona (decisión del dueño).
 *
 * Primero se intenta el botón con enlace; si Meta rechaza ESE FORMATO (código
 * 100 genérico), se manda el enlace escrito en el texto, que siempre funciona.
 * El intento rechazado no gasta el único privado del comentario. No se reintenta
 * ante un comentario inexistente (1893060) ni ante permisos o token: fallaría
 * igual y taparía el motivo real.
 *
 * @returns cómo salió: 'boton' o 'texto' (queda en el registro).
 */
export async function mandarPrivadoConEnlace(a: {
  comentarioId: string
  texto: string
  textoBoton: string
  enlace: string
}): Promise<'boton' | 'texto'> {
  const { pageId } = await paginaDeLaCuenta()
  const titulo = a.textoBoton.trim().slice(0, MAX_TITULO_BOTON) || 'Ver la propiedad'

  try {
    await paginaFetch(`/${pageId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { comment_id: a.comentarioId },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: a.texto.trim().slice(0, MAX_TEXTO_CON_BOTON),
              buttons: [{ type: 'web_url', url: a.enlace, title: titulo }],
            },
          },
        },
      }),
    })
    return 'boton'
  } catch (e) {
    const esFormato = e instanceof ErrorInstagram && e.code === 100 && e.subcode !== 1893060
    if (!esFormato) throw e
  }

  await paginaFetch(`/${pageId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      recipient: { comment_id: a.comentarioId },
      message: { text: recortarCuidandoEnlaces(`${a.texto.trim()}\n${a.enlace}`, MAX_TEXTO) },
    }),
  })
  return 'texto'
}

/**
 * El único mensaje que Instagram permite mandarle a quien comentó.
 *
 * Uno solo por persona y por comentario, y dentro de los 7 días — los dos
 * límites los impone Instagram, están documentados y el módulo de decisión los
 * respeta antes de llegar acá.
 */
export async function mandarPrivadoConBoton(a: {
  comentarioId: string
  texto: string
  textoBoton: string
  reelId: string
}): Promise<void> {
  // Por la PÁGINA y con su token: ver `paginaDeLaCuenta` en client.ts.
  const { pageId } = await paginaDeLaCuenta()

  const titulo = a.textoBoton.trim().slice(0, MAX_TITULO_BOTON) || 'Sí, pasámela'

  await paginaFetch(`/${pageId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      recipient: { comment_id: a.comentarioId },
      message: {
        text: recortarCuidandoEnlaces(a.texto, MAX_TEXTO),
        quick_replies: [
          { content_type: 'text', title: titulo, payload: datoDelBoton(a.reelId) },
        ],
      },
    }),
  })
}

/**
 * Un mensaje suelto, sin botón. Es el que lleva el enlace de la landing después
 * de que la persona tocó el botón: ahí ya hay conversación abierta.
 */
export async function mandarTexto(a: {
  destinatarioId: string
  texto: string
}): Promise<void> {
  const { pageId } = await paginaDeLaCuenta()

  await paginaFetch(`/${pageId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      recipient: { id: a.destinatarioId },
      message: { text: recortarCuidandoEnlaces(a.texto, MAX_TEXTO) },
    }),
  })
}
