/**
 * Responder comentarios de Instagram.
 *
 * Es la mitad de la automatización que YA FUNCIONA hoy: el permiso está
 * verificado contra la cuenta real (2026-09-22). La otra mitad —el mensaje
 * privado— espera a que Meta destrabe `pages_messaging`.
 */
import { cuentaInstagram, instagramFetch } from './client'

/** Tope de un comentario en Instagram. */
const MAX_COMENTARIO = 2200

/**
 * Responde dentro del hilo del comentario, no como un comentario suelto.
 *
 * Que sea una respuesta al hilo importa: le llega la notificación a la persona
 * y queda colgando de lo que escribió, en vez de perderse al final de una lista
 * de 33 comentarios.
 */
export async function responderComentario(comentarioId: string, mensaje: string): Promise<void> {
  const texto = mensaje.trim()
  if (!texto) {
    throw new Error('No se puede responder con una respuesta vacía.')
  }

  await instagramFetch(`/${comentarioId}/replies`, {
    method: 'POST',
    body: JSON.stringify({ message: texto.slice(0, MAX_COMENTARIO) }),
  })
}

/**
 * ¿Este comentario lo escribimos nosotros?
 *
 * Nuestras propias respuestas vuelven a entrar por el webhook. Sin este freno el
 * sistema se contestaría a sí mismo, y si la palabra clave aparece en el texto
 * del reel, en bucle.
 *
 * Sin identificador de autor se asume AJENO: asumirlo propio silenciaría
 * comentarios de gente real, que es el error caro de los dos.
 */
export async function esComentarioDeLaCuenta(autorId: string | null | undefined): Promise<boolean> {
  if (!autorId) return false
  const { igId } = await cuentaInstagram()
  return autorId === igId
}
