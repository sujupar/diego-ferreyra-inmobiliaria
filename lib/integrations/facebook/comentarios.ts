/**
 * Responder comentarios de la Página de Facebook (la de la cuenta de Instagram).
 * Con el token de la Página: `pages_manage_engagement` está concedido (verificado
 * el 2026-11-04 contra un comentario inventado: Meta responde "parámetro
 * inválido", no un error de permiso).
 */
import { paginaDeLaCuenta, paginaFetch } from '@/lib/integrations/instagram/client'

const MAX_COMENTARIO = 8000
/** Los ids de Facebook son números con un guion bajo (`post_comentario`): nada más viaja en la ruta. */
const ID_FB = /^[0-9_]{3,80}$/

export async function responderComentarioFb(comentarioId: string, mensaje: string): Promise<void> {
  const texto = mensaje.trim()
  if (!texto) throw new Error('No se puede responder con una respuesta vacía.')
  if (!ID_FB.test(comentarioId)) throw new Error('Identificador de comentario de Facebook inválido.')
  await paginaFetch(`/${comentarioId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ message: texto.slice(0, MAX_COMENTARIO) }),
  })
}

/** Nuestras respuestas vuelven por el webhook: sin este freno la Página se contestaría a sí misma. */
export async function esComentarioDeLaPagina(autorId: string | null | undefined): Promise<boolean> {
  if (!autorId) return false
  const { pageId } = await paginaDeLaCuenta()
  return autorId === pageId
}
