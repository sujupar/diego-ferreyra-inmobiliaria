/**
 * Lo cargado en la visita para portales y landing, en filas mirables.
 *
 * POR QUÉ (2026-09-17): desde el 2026-09-14 la visita también junta expensas,
 * los campos que piden MercadoLibre y Argenprop, y las respuestas para la
 * landing. Eso se guardaba y NO se veía en ninguna pantalla: el asesor no tenía
 * cómo comprobar qué había quedado cargado antes de publicar.
 *
 * Los ids de los atributos de portal (`HAS_LIFT`, `CANTIDAD_BANOS`) no se
 * traducen acá: sus nombres viven en el schema que cada portal devuelve por red,
 * y traducirlos a mano sería inventar un diccionario que se desactualiza solo.
 * Se muestra CUÁNTOS hay; el detalle con nombres está en el formulario.
 *
 * Módulo PURO: sin red, sin base, sin React.
 */
import { preguntasFijasLanding } from '@/lib/landing/questions-generator'

export interface FilaDifusion {
  label: string
  value: string
  /** Ocupa el ancho completo (textos largos). */
  wide?: boolean
}

function contar(v: unknown): number {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 0
  return Object.keys(v as Record<string, unknown>).length
}

function formatearPesos(n: number): string {
  return `$${new Intl.NumberFormat('es-AR').format(n)}`
}

export function filasDeDifusion(snapshot: unknown, barrio?: string | null): FilaDifusion[] {
  if (!snapshot || typeof snapshot !== 'object') return []
  const obj = snapshot as Record<string, unknown>
  const portales = (obj.portales && typeof obj.portales === 'object' ? obj.portales : {}) as Record<string, unknown>
  const landing = (obj.landing && typeof obj.landing === 'object' ? obj.landing : {}) as Record<string, unknown>
  const filas: FilaDifusion[] = []

  const expensas = portales.expensas
  if (typeof expensas === 'number' && expensas > 0) {
    filas.push({ label: 'Expensas', value: formatearPesos(expensas) })
  }

  const ml = contar(portales.ml)
  const ap = contar(portales.ap)
  if (ml > 0) filas.push({ label: 'MercadoLibre', value: `${ml} ${ml === 1 ? 'dato cargado' : 'datos cargados'}` })
  if (ap > 0) filas.push({ label: 'Argenprop', value: `${ap} ${ap === 1 ? 'dato cargado' : 'datos cargados'}` })

  // Las respuestas de la landing SÍ tienen pregunta conocida: se muestran enteras.
  for (const p of preguntasFijasLanding(barrio)) {
    const r = landing[p.id]
    if (typeof r === 'string' && r.trim()) filas.push({ label: p.question, value: r.trim(), wide: true })
  }

  return filas
}
