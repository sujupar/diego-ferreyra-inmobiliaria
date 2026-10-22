/**
 * El código del aviso de MercadoLibre desde lo que pega una persona: el código ("MLA3968141346",
 * "MLA-3968141346") o el link del aviso. Hace falta porque hay avisos publicados a mano en ML que
 * la plataforma no conoce (caso Roque Pérez, 2026-10-22): con el código, las visitas salen solas.
 * Puro. Solo Argentina (MLA); 8 dígitos o más para no confundir un número cualquiera.
 */
const CODIGO = /(?:^|[^A-Z0-9])MLA-?(\d{8,})(?![0-9])/i

export function idDeAvisoMercadoLibre(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim()
  if (!t) return null
  const m = CODIGO.exec(` ${t.split(/[?#]/)[0]}`)
  return m ? `MLA${m[1]}` : null
}
