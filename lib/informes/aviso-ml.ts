/**
 * El código del aviso de MercadoLibre desde lo que pega una persona: el código ("MLA3968141346",
 * "MLA-3968141346") o el link del aviso. Hace falta porque hay avisos publicados a mano en ML que
 * la plataforma no conoce (caso Roque Pérez, 2026-10-22): con el código, las visitas salen solas.
 * Puro. Solo Argentina (MLA); 8 dígitos o más para no confundir un número cualquiera.
 */
const CODIGO = /(?:^|[^A-Z0-9])MLA-?(\d{8,})(?![0-9])/i

// ─── Avisos de la cuenta de ML que son de la propiedad ───────────────────────

/** Palabras que no identifican una calle ("Av.", "Tte. Gral.", "N.°"…). */
const RELLENO = new Set(['av', 'avda', 'avenida', 'calle', 'pje', 'pasaje', 'tte', 'gral', 'general', 'teniente', 'dr', 'doctor',
  'presidente', 'pres', 'n', 'nro', 'numero', 'de', 'del', 'la', 'las', 'los', 'el', 'y', 'piso', 'depto', 'dto'])

/** "Tte. Gral. Juan D. Perón 4227-13" → { calle: ['juan','peron'], altura: '4227' }. Solo lo que va antes de la primera coma. */
function direccionComparable(texto: string): { calle: string[]; altura: string } | null {
  const limpio = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(',')[0]
  const m = /(?:^|[^0-9a-z])(\d{2,5})(?![0-9a-z])/.exec(limpio)
  if (!m) return null
  const calle = limpio.slice(0, m.index + 1).split(/[^a-z]+/).filter(p => p.length >= 2 && !RELLENO.has(p))
  return calle.length ? { calle, altura: m[1] } : null
}

/**
 * ¿Es la misma propiedad? Misma altura y la misma ÚLTIMA palabra de la calle (la que la nombra: "Perón",
 * "Yrigoyen", "Velez"). Con solo "alguna palabra en común", "Juan B. Justo 100" sería "Juan Perón 100".
 * Sin altura no se empareja: sería adivinar, y lo que se empareja suma números frente al propietario.
 */
export function mismaDireccion(a: string, b: string): boolean {
  const x = direccionComparable(a)
  const y = direccionComparable(b)
  if (!x || !y || x.altura !== y.altura) return false
  return x.calle[x.calle.length - 1] === y.calle[y.calle.length - 1]
}

export interface AvisoDeML { id: string; titulo: string | null; url: string | null; origen: 'plataforma' | 'cuenta' | 'manual' }

/** Tope de avisos que se suman: cada uno son pedidos a una API con cupo chico (los interesados de ML). */
export const MAX_AVISOS_ML = 5

/**
 * Los avisos de ML que se suman en el informe: el que publicó la plataforma, los activos de la cuenta con la
 * misma dirección (publicados a mano; Moldes 2112 tenía dos a la vez) y el que agregó Paula, sin repetir y
 * menos los que Paula sacó.
 */
export function combinarAvisos(f: {
  plataforma: string[]
  cuenta: Array<{ id: string; titulo: string | null; url: string | null }>
  manual: string | null
  excluidos: string[]
}): AvisoDeML[] {
  const fuera = new Set(f.excluidos)
  const vistos = new Map<string, AvisoDeML>()
  const datos = new Map(f.cuenta.map(c => [c.id, c]))
  const sumar = (id: string, origen: AvisoDeML['origen']) => {
    if (fuera.has(id) || vistos.has(id)) return
    vistos.set(id, { id, titulo: datos.get(id)?.titulo ?? null, url: datos.get(id)?.url ?? null, origen })
  }
  f.plataforma.forEach(id => sumar(id, 'plataforma'))
  f.cuenta.forEach(c => sumar(c.id, 'cuenta'))
  if (f.manual) sumar(f.manual, 'manual')
  return [...vistos.values()].slice(0, MAX_AVISOS_ML)
}

export function idDeAvisoMercadoLibre(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim()
  if (!t) return null
  const m = CODIGO.exec(` ${t.split(/[?#]/)[0]}`)
  return m ? `MLA${m[1]}` : null
}
