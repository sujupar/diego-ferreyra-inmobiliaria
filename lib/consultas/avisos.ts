/**
 * Avisos sin propiedad: qué consultas se pueden conectar JUNTAS (una conexión
 * por aviso, spec Entrega 2 §3.2) y cómo se le muestra cada aviso al equipo.
 *
 * Medido el 2026-10-29: las 229 consultas sin propiedad caen en 42 avisos; los
 * 10 primeros juntan ~170. Conectar por aviso resuelve casi todo de una.
 * Módulo puro y seguro para el navegador.
 */
import type { ConsultaEnBandeja } from './tipos'

/**
 * Si un código identifica a un AVISO (y entonces todas sus consultas se
 * conectan juntas y las próximas entran solas) o solo a ese mail.
 *
 * No agrupan:
 *  - vacío;
 *  - un pedazo de enlace: el lector del mail tomó `CÓD:https://…` como código
 *    `https` (5 consultas reales). Recordarlo crearía un "aviso" falso al que
 *    irían a parar consultas de cualquier propiedad;
 *  - en ZonaProp, un número de 9 o más dígitos: es la REF, que cambia en CADA
 *    mail (cuando el asunto no trae el CÓD, el lector guarda la REF). Los
 *    códigos de aviso de ZonaProp son alfanuméricos ("2DLPOM", "DHO6481365").
 */
export function codigoAgrupable(portal: string, codigo: string | null | undefined): boolean {
  const c = codigo?.trim() ?? ''
  if (!c) return false
  if (/[/:]/.test(c) || /^https?$/i.test(c)) return false
  if (portal === 'zonaprop' && /^\d{9,}$/.test(c)) return false
  return true
}

/** Espacios repetidos (Argenprop escribe "Alvarez Jonte  3500") y bordes. */
function limpio(t: string): string {
  return t.replace(/\s+/g, ' ').trim()
}

/**
 * Cómo se llama el aviso para el equipo, sacado del asunto del mail:
 *  - ZonaProp: "…en el aviso <TÍTULO>! CÓD:…" (el "Vieron tu teléfono" no lo trae);
 *  - Argenprop: "<email> contactó por <DIRECCIÓN en BARRIO>".
 * Si el asunto no lo dice, la dirección que trajo el mail; si no, null.
 */
export function tituloDelAviso(portal: string, asunto: string | null, direccion: string | null): string | null {
  const a = asunto ?? ''
  if (portal === 'zonaprop') {
    const i = a.toLowerCase().indexOf('aviso ')
    if (i >= 0) {
      let t = a.slice(i + 6)
      const cod = t.search(/!?\s*C[ÓO]D/i)
      if (cod >= 0) t = t.slice(0, cod)
      t = limpio(t.replace(/[.!…\s]+$/g, ''))
      if (t) return t
    }
  }
  if (portal === 'argenprop') {
    const m = /contact[óo] por (.+)$/i.exec(a)
    if (m) return limpio(m[1])
  }
  const d = direccion?.trim()
  return d ? limpio(d) : null
}

/** Lo mínimo de una consulta de portal sin propiedad para agruparla. */
export interface FilaSinPropiedad {
  portal: string
  codigo: string | null
  asunto: string | null
  direccion: string | null
  url: string | null
  recibida_at: string
}

export interface AvisoSinPropiedad {
  portal: string
  /** TAL CUAL está guardado: la conexión compara por igualdad exacta. */
  codigo: string
  titulo: string | null
  url: string | null
  /** Consultas sin propiedad de este aviso (todas, no solo las del período). */
  n: number
  ultima: string
}

function ms(v: string): number {
  const n = Date.parse(v)
  return Number.isNaN(n) ? Number.NEGATIVE_INFINITY : n
}

/**
 * Una tarjeta por aviso, la de más consultas primero (a igual cantidad, la más
 * reciente). El título y el enlace salen de la consulta MÁS NUEVA que los trae:
 * si el aviso cambió de título, el equipo ve el actual.
 */
export function agruparAvisos(filas: readonly FilaSinPropiedad[]): { avisos: AvisoSinPropiedad[]; sueltas: number } {
  const porClave = new Map<string, AvisoSinPropiedad & { msTitulo: number; msUrl: number }>()
  let sueltas = 0
  for (const f of filas) {
    if (!codigoAgrupable(f.portal, f.codigo) || f.codigo === null) { sueltas++; continue }
    const clave = `${f.portal}\u0000${f.codigo}`
    const cuando = ms(f.recibida_at)
    const titulo = tituloDelAviso(f.portal, f.asunto, f.direccion)
    let a = porClave.get(clave)
    if (!a) {
      a = { portal: f.portal, codigo: f.codigo, titulo: null, url: null, n: 0, ultima: f.recibida_at,
        msTitulo: Number.NEGATIVE_INFINITY, msUrl: Number.NEGATIVE_INFINITY }
      porClave.set(clave, a)
    }
    a.n++
    if (cuando > ms(a.ultima)) a.ultima = f.recibida_at
    if (titulo && cuando >= a.msTitulo) { a.titulo = titulo; a.msTitulo = cuando }
    if (f.url && cuando >= a.msUrl) { a.url = f.url; a.msUrl = cuando }
  }
  const avisos = [...porClave.values()]
    .sort((x, y) => y.n - x.n || ms(y.ultima) - ms(x.ultima))
    .map((a): AvisoSinPropiedad => ({ portal: a.portal, codigo: a.codigo, titulo: a.titulo, url: a.url, n: a.n, ultima: a.ultima }))
  return { avisos, sueltas }
}

/** Para el aviso de arriba de la Bandeja: «N consultas de M avisos no tienen propiedad». */
export function resumenSinPropiedad(consultas: readonly ConsultaEnBandeja[]): { consultas: number; avisos: number; sueltas: number } {
  const avisos = new Set<string>()
  let n = 0
  let sueltas = 0
  for (const c of consultas) {
    if (c.property_id !== null || c.tipo !== 'portal') continue
    n++
    if (codigoAgrupable(c.portal, c.aviso_codigo)) avisos.add(`${c.portal}\u0000${c.aviso_codigo}`)
    else sueltas++
  }
  return { consultas: n, avisos: avisos.size, sueltas }
}

/** Minúsculas, sin tildes ni signos. */
function plano(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

const PREFIJOS_CALLE = new Set(['av', 'avda', 'avenida', 'calle', 'pje', 'pasaje', 'bv', 'boulevard', 'gral', 'general', 'dr', 'tte', 'teniente'])

/** "Av. Álvarez Jonte 3541" → "alvarez jonte" (la calle sin prefijos ni altura). */
function calleDe(direccion: string): string {
  const palabras = plano(direccion).split(' ')
  const hastaNumero = palabras.findIndex((p) => /^\d+$/.test(p))
  return palabras.slice(0, hastaNumero >= 0 ? hastaNumero : palabras.length)
    .filter((p) => !PREFIJOS_CALLE.has(p)).join(' ')
}

/**
 * Hasta 3 propiedades que probablemente sean las del aviso. Pistas, de más a
 * menos fuertes: la MISMA calle (Argenprop trae "Alvarez Jonte 3500 en Villa
 * del Parque") y el barrio nombrado en el título o la dirección. Sin ninguna
 * pista no sugiere nada: una sugerencia inventada invita a conectar mal, y
 * conectar mal manda las consultas futuras al asesor equivocado.
 */
export function sugerirPropiedades<T extends { id: string; address: string; neighborhood: string | null }>(
  titulo: string | null,
  propiedades: readonly T[],
): T[] {
  if (!titulo) return []
  const texto = plano(titulo)
  const antesDeEn = plano(titulo.split(/\s+en\s+/i)[0] ?? '')
  const calleAviso = calleDe(antesDeEn)
  const puntuadas: Array<{ p: T; puntos: number; orden: number }> = []
  propiedades.forEach((p, orden) => {
    let puntos = 0
    const calle = calleDe(p.address)
    if (calle.length >= 4 && calleAviso.length >= 4 && (calle === calleAviso || calle.endsWith(` ${calleAviso}`) || calleAviso.endsWith(` ${calle}`))) {
      puntos += 3
    }
    const barrio = p.neighborhood ? plano(p.neighborhood) : ''
    if (barrio.length >= 3 && ` ${texto} `.includes(` ${barrio} `)) puntos += 1
    if (puntos > 0) puntuadas.push({ p, puntos, orden })
  })
  return puntuadas.sort((a, b) => b.puntos - a.puntos || a.orden - b.orden).slice(0, 3).map((x) => x.p)
}
