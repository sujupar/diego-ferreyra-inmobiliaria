/**
 * Interpreta el formato "markdown" mínimo que trae una descripción pegada desde
 * ChatGPT o un documento: `### Título` y `**negrita**`.
 *
 * Por qué existe (2026-11-19): la landing de Salta 297 mostraba
 * "### UN 2 AMBIENTES AL FRENTE…" con los numerales a la vista, y la de
 * Rogelio Vidal 7 párrafos con asteriscos. La descripción se guarda tal cual
 * la escribe/pega el asesor, y es la misma que va a los portales, así que no
 * se "limpia" el dato: se interpreta al MOSTRARLO.
 *
 * Devuelve estructura, nunca HTML: el componente la dibuja con elementos de
 * React, así un texto escrito por cualquiera no puede inyectar marcado.
 */

export interface Tramo {
  texto: string
  negrita: boolean
}

export type BloqueTexto =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'parrafo'; tramos: Tramo[] }

const TITULO_MD = /^#{1,6}\s+(.+?)\s*#*\s*$/
const NEGRITA = /\*\*(.+?)\*\*/g

/** Partes de un renglón: lo que está entre `**…**` va en negrita. */
export function tramosDe(linea: string): Tramo[] {
  const tramos: Tramo[] = []
  let ultimo = 0
  for (const m of linea.matchAll(NEGRITA)) {
    const idx = m.index ?? 0
    if (idx > ultimo) tramos.push({ texto: linea.slice(ultimo, idx), negrita: false })
    tramos.push({ texto: m[1], negrita: true })
    ultimo = idx + m[0].length
  }
  if (ultimo < linea.length) tramos.push({ texto: linea.slice(ultimo), negrita: false })
  // Un `**` que quedó sin pareja no es formato: es ruido, se va.
  return tramos
    .map(t => ({ ...t, texto: t.texto.replace(/\*\*/g, '') }))
    .filter(t => t.texto.length > 0)
}

/** ¿El renglón entero es un título? `### X`, o una línea toda en negrita y en MAYÚSCULAS. */
function comoTitulo(linea: string): string | null {
  const md = linea.match(TITULO_MD)
  if (md) return md[1].replace(/\*\*/g, '').trim() || null
  const todaNegrita = linea.match(/^\*\*(.+)\*\*$/)
  if (todaNegrita && !todaNegrita[1].includes('**')) {
    const t = todaNegrita[1].trim()
    // "Tiene letras y ninguna minúscula": un titular, no una frase destacada.
    if (/\p{L}/u.test(t) && t === t.toLocaleUpperCase('es')) return t
  }
  return null
}

export function bloquesDeTexto(texto: string): BloqueTexto[] {
  return texto
    .normalize('NFC')
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean)
    .map((linea): BloqueTexto => {
      const titulo = comoTitulo(linea)
      if (titulo) return { tipo: 'titulo', texto: titulo }
      return { tipo: 'parrafo', tramos: tramosDe(linea) }
    })
    .filter(b => b.tipo === 'titulo' || b.tramos.length > 0)
}
