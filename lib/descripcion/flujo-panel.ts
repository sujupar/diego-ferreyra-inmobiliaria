/**
 * Las decisiones del panel "Generar descripción", sin React: qué paso sigue,
 * cuándo pedir una corrección y qué respuestas mandar. Puro y testeado; el
 * componente solo pinta y llama a la API.
 */
import type { FuenteRespuesta } from './respuestas'

export type PasoPanel = 'fotos' | 'zona' | 'preguntas' | 'escribir' | 'vista'

/**
 * Las preguntas se muestran SOLO si falta alguna: lo contestado en la visita o
 * en la landing no se vuelve a preguntar (pedido del dueño, 2026-09-19).
 */
export function siguientePaso(actual: PasoPanel, e: { pendientes: number }): PasoPanel {
  switch (actual) {
    case 'fotos': return 'zona'
    case 'zona': return e.pendientes > 0 ? 'preguntas' : 'escribir'
    case 'preguntas': return 'escribir'
    case 'escribir': return 'vista'
    case 'vista': return 'vista'
  }
}

/**
 * Si el texto volvió con problemas (adjetivo prohibido, rótulos, markdown,
 * titular largo) se pide UNA corrección, en otro pedido: nunca dos llamadas de
 * IA en el mismo. Si la corrección también falla, se muestra igual con el aviso.
 */
export function debePedirCorreccion(problemas: string[], yaCorregido: boolean): boolean {
  return problemas.length > 0 && !yaCorregido
}

export function respuestasParaEnviar(
  pendientes: Array<{ id: string }>,
  valores: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { id } of pendientes) {
    const v = (valores[id] ?? '').trim()
    if (v) out[id] = v
  }
  return out
}

export function etiquetaFuente(f: FuenteRespuesta): string {
  return f === 'propiedad' ? 'de la ficha' : f === 'visita' ? 'de la visita' : 'de la landing'
}
