/**
 * Los comentarios de la Página de Facebook que avisa Meta (objeto `page`, campo
 * `feed`). Llegan por la MISMA dirección y con la misma firma que los de
 * Instagram; la ruta une las dos listas.
 *
 * Misma regla que el lector de Instagram: lo que no se entiende se descarta sin
 * romper nada, porque una excepción tiraría el lote entero.
 */
import type { ComentarioDelAviso } from '@/lib/integrations/instagram/webhook'

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}
const campo = (o: unknown, k: string): unknown => (esObjeto(o) ? o[k] : undefined)
const texto = (x: unknown): string | null => (typeof x === 'string' && x.length > 0 ? x : null)
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])

/** Meta manda segundos; lo que no sea un número razonable se descarta. */
function hora(x: unknown): string | null {
  if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0) return null
  const d = new Date(x > 1e12 ? x : x * 1000)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function leerComentariosDePagina(cuerpo: unknown): ComentarioDelAviso[] {
  if (campo(cuerpo, 'object') !== 'page') return []
  const salida: ComentarioDelAviso[] = []
  for (const entrada of lista(campo(cuerpo, 'entry'))) {
    const horaEntrada = hora(campo(entrada, 'time'))
    for (const cambio of lista(campo(entrada, 'changes'))) {
      if (campo(cambio, 'field') !== 'feed') continue
      const v = campo(cambio, 'value')
      // Solo comentarios NUEVOS: una edición o un borrado no se contesta.
      if (campo(v, 'item') !== 'comment' || campo(v, 'verb') !== 'add') continue
      const comentarioId = texto(campo(v, 'comment_id'))
      const postId = texto(campo(v, 'post_id'))
      const autorId = texto(campo(campo(v, 'from'), 'id'))
      if (!comentarioId || !postId || !autorId) continue
      salida.push({
        plataforma: 'facebook',
        igMediaId: postId,
        comentarioId,
        autorId,
        // Facebook da el nombre, no un usuario: no sirve para las cuentas de prueba
        // (que se reconocen por usuario de Instagram). Por eso en Modo prueba, Facebook simula.
        username: null,
        texto: texto(campo(v, 'message')),
        creadoEn: hora(campo(v, 'created_time')) ?? horaEntrada ?? '',
      })
    }
  }
  return salida
}
