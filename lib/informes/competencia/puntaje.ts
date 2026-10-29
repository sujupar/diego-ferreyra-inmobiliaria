/**
 * Qué tan parecida es una propiedad publicada a la nuestra, y el porqué en palabras (lo ve Paula al elegir).
 * Puro. El valor del m² necesita precio y m²: sin eso la candidata queda, pero al final. Lo que se leyó al abrir
 * el aviso (disposición, estado, antigüedad…) completa la tarjeta y suma si coincide con la nuestra.
 */
import { mismaDireccion } from '../aviso-ml'
import { normalizarDisposicion, normalizarEstado, type Disposicion, type Estado } from './caracteristicas'

export interface AvisoDeListado {
  portal: 'argenprop' | 'mercadolibre'
  url: string
  titulo: string | null
  direccion: string
  precio: number | null
  moneda: 'USD' | 'ARS' | null
  m2: number | null
  ambientes: number | null
  dormitorios: number | null
  banos: number | null
  cocheras: number | null
  antiguedad: number | null
  foto: string | null
  vistas: number | null
  inmobiliaria: string | null
}

/** Lo que se leyó al abrir el aviso (scraper de fichas). Texto tal cual lo da el portal. */
export interface DetalleCandidata {
  disposicion: string | null
  estado: string | null
  orientacion: string | null
  vistas: number | null
  publicadoHace: string | null
  antiguedad: number | null
  cocheras: number | null
  error?: string | null
}

export interface Referencia {
  direccion: string
  ambientes: number | null
  m2: number | null
  precio: number | null
  antiguedad: number | null
  disposicion?: Disposicion | null
  estado?: Estado | null
  /** Sin moneda no se puede comparar el valor del m² (y no se filtra). */
  moneda?: 'USD' | 'ARS' | null
}

export interface Candidata extends AvisoDeListado {
  puntaje: number
  porque: string[]
  disposicion: Disposicion | null
  estado: Estado | null
  orientacion: string | null
  publicadoHace: string | null
  /** Ya se abrió el aviso para leer disposición y estado. */
  abierta: boolean
  /** Precio ÷ m², redondeado; null si falta alguno. */
  valorM2: number | null
}

export const MAX_CANDIDATAS = 12

const valorM2 = (precio: number | null, m2: number | null) => (precio && m2 && m2 > 0 ? Math.round(precio / m2) : null)

export interface FiltroMasBaratas {
  avisos: AvisoDeListado[]
  /** null = la nuestra no tiene precio, m² o moneda: no se filtró. */
  valorM2Nuestro: number | null
  descartadasPorPrecio: number
  /** Sin precio, sin m² o en otra moneda: no se pueden comparar. */
  sinComparar: number
}

/**
 * Pedido del dueño (2026-10-29): las competidoras del informe valen MENOS por m² que la nuestra (estrictamente
 * menos). Se compara en la misma moneda; lo que no se puede comparar queda afuera. Si la nuestra no tiene precio o
 * m², no se puede filtrar y la lista va entera (la pantalla lo avisa).
 */
export function filtroMasBaratas(ref: Referencia, avisos: AvisoDeListado[]): FiltroMasBaratas {
  const nuestro = ref.moneda ? valorM2(ref.precio, ref.m2) : null
  if (nuestro === null) return { avisos, valorM2Nuestro: null, descartadasPorPrecio: 0, sinComparar: 0 }
  const r: FiltroMasBaratas = { avisos: [], valorM2Nuestro: nuestro, descartadasPorPrecio: 0, sinComparar: 0 }
  for (const a of avisos) {
    const suyo = valorM2(a.precio, a.m2)
    if (suyo === null || a.moneda !== ref.moneda) r.sinComparar++
    else if (suyo >= nuestro) r.descartadasPorPrecio++
    else r.avisos.push(a)
  }
  return r
}

const cerca = (a: number | null, b: number | null, tolerancia: number) => a !== null && b !== null && b > 0 && Math.abs(a - b) / b <= tolerancia

function puntuar(ref: Referencia, a: AvisoDeListado, d: DetalleCandidata | undefined): Candidata {
  const c: Candidata = {
    ...a,
    antiguedad: a.antiguedad ?? d?.antiguedad ?? null,
    cocheras: a.cocheras ?? d?.cocheras ?? null,
    vistas: a.vistas ?? d?.vistas ?? null,
    disposicion: normalizarDisposicion(d?.disposicion),
    estado: normalizarEstado(d?.estado),
    orientacion: d?.orientacion ?? null,
    publicadoHace: d?.publicadoHace ?? null,
    abierta: !!d && !d.error,
    valorM2: valorM2(a.precio, a.m2),
    puntaje: 0,
    porque: [],
  }
  const sumar = (n: number, motivo?: string) => { c.puntaje += n; if (motivo) c.porque.push(motivo) }
  if (ref.ambientes !== null && c.ambientes !== null) {
    if (c.ambientes === ref.ambientes) sumar(30, 'mismos ambientes')
    else if (Math.abs(c.ambientes - ref.ambientes) === 1) sumar(12, `${c.ambientes} ambientes`)
  }
  if (cerca(c.m2, ref.m2, 0.15)) sumar(25, 'm² parecidos')
  else if (cerca(c.m2, ref.m2, 0.3)) sumar(12, 'm² cercanos')
  if (cerca(c.precio, ref.precio, 0.2)) sumar(20, 'precio parecido')
  else if (cerca(c.precio, ref.precio, 0.4)) sumar(10, 'precio cercano')
  if (ref.antiguedad !== null && c.antiguedad !== null && Math.abs(c.antiguedad - ref.antiguedad) <= 10) sumar(10, 'antigüedad parecida')
  if (ref.disposicion && c.disposicion === ref.disposicion) sumar(10, `también al ${c.disposicion}`)
  if (ref.estado && c.estado === ref.estado) sumar(10, `mismo estado (${c.estado})`)
  if (c.foto) sumar(5)
  // Sin precio o sin m² no hay valor del m², que es lo que se compara en el informe: al final de la lista.
  if (c.precio === null || c.m2 === null) sumar(-100)
  return c
}

/** Nuestra propiedad afuera, un aviso repetido entre portales (misma dirección y precio) una sola vez, tope 12. */
export function ordenarCandidatas(ref: Referencia, avisos: AvisoDeListado[], detalles: Record<string, DetalleCandidata> = {}): Candidata[] {
  const unicas: AvisoDeListado[] = []
  for (const a of filtroMasBaratas(ref, avisos).avisos) {
    if (mismaDireccion(ref.direccion, a.direccion)) continue
    if (unicas.some(u => u.url === a.url || (u.precio === a.precio && mismaDireccion(u.direccion, a.direccion)))) continue
    unicas.push(a)
  }
  return unicas.map(a => puntuar(ref, a, detalles[a.url])).sort((x, y) => y.puntaje - x.puntaje).slice(0, MAX_CANDIDATAS)
}
