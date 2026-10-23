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
}

export const MAX_CANDIDATAS = 12

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
  for (const a of avisos) {
    if (mismaDireccion(ref.direccion, a.direccion)) continue
    if (unicas.some(u => u.url === a.url || (u.precio === a.precio && mismaDireccion(u.direccion, a.direccion)))) continue
    unicas.push(a)
  }
  return unicas.map(a => puntuar(ref, a, detalles[a.url])).sort((x, y) => y.puntaje - x.puntaje).slice(0, MAX_CANDIDATAS)
}
