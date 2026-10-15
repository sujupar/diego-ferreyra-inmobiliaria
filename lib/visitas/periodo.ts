/**
 * Período de la sección Visitas (spec §3.4 y §4.5): 7 días, 30 días, este mes o
 * personalizado. Las puntas son DÍAS DE ARGENTINA (AAAA-MM-DD). Quién convierte un
 * día en instantes es el servidor (`inicioDelDiaArgentina` / `finDelDiaArgentina`),
 * así la misma URL muestra lo mismo en cualquier máquina.
 *
 * Con `from` y `to` manda el rango aunque venga otro `periodo`: así llega el link de
 * la tarjeta "Visitas de hoy" de /inicio (`/visits?from=<hoy>&to=<hoy>`), que no se
 * puede romper. Módulo puro y seguro para el navegador.
 */
import { construirInstante, sumarDias } from './horario'

export const PERIODOS = ['7d', '30d', 'mes', 'personalizado'] as const
export type ClavePeriodo = (typeof PERIODOS)[number]
export const PERIODO_POR_DEFECTO: ClavePeriodo = '30d'
/** Un año (con bisiesto). Más que eso no es un tablero, es un informe, y la ruta lo paga en filas. */
export const MAX_DIAS_PERIODO = 366

export const PERIODO_ETIQUETA: Record<ClavePeriodo, string> = {
  '7d': '7 días',
  '30d': '30 días',
  mes: 'Este mes',
  personalizado: 'Personalizado',
}

export interface Periodo {
  clave: ClavePeriodo
  desde: string
  hasta: string
  etiqueta: string
}

const MS_DIA = 86_400_000

export function esClavePeriodo(v: unknown): v is ClavePeriodo {
  return typeof v === 'string' && (PERIODOS as readonly string[]).includes(v)
}

/** AAAA-MM-DD que existe en el calendario (`2026-02-29` no). */
export function esFechaValida(v: string | null | undefined): v is string {
  return typeof v === 'string' && construirInstante(v, '12:00') !== null
}

/** Días entre dos fechas de calendario (anclado al mediodía UTC: nunca cruza de día). */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / MS_DIA)
}

function ultimoDiaDelMes(fecha: string): string {
  const anio = Number(fecha.slice(0, 4))
  const mes = Number(fecha.slice(5, 7)) // 1–12: como índice 0–11 de Date.UTC es el mes SIGUIENTE
  const primeroDelSiguiente = new Date(Date.UTC(anio, mes, 1, 12)).toISOString().slice(0, 10)
  return sumarDias(primeroDelSiguiente, -1)
}

function ddmm(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
}

function etiquetaDeRango(desde: string, hasta: string, hoy: string): string {
  if (desde === hasta) return desde === hoy ? 'Hoy' : `El ${ddmm(desde)}`
  return `Del ${ddmm(desde)} al ${ddmm(hasta)}`
}

/** Mensaje de error del rango, o `null` si está bien. Lo usan esta función y las rutas. */
export function validarRango(desde: string, hasta: string): string | null {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) return 'Elegí las dos fechas del período'
  if (desde > hasta) return 'La fecha "desde" es posterior a "hasta"'
  if (diasEntre(desde, hasta) + 1 > MAX_DIAS_PERIODO) return 'Elegí un período de hasta un año'
  return null
}

export function resolverPeriodo(
  entrada: { periodo?: string | null; from?: string | null; to?: string | null },
  hoy: string,
): { ok: true; periodo: Periodo } | { ok: false; error: string } {
  const from = entrada.from?.trim() ?? ''
  const to = entrada.to?.trim() ?? ''
  if (from || to) {
    const error = validarRango(from, to)
    if (error) return { ok: false, error }
    return { ok: true, periodo: { clave: 'personalizado', desde: from, hasta: to, etiqueta: etiquetaDeRango(from, to, hoy) } }
  }
  const clave = esClavePeriodo(entrada.periodo) ? entrada.periodo : PERIODO_POR_DEFECTO
  if (clave === '7d') return { ok: true, periodo: { clave, desde: sumarDias(hoy, -6), hasta: hoy, etiqueta: 'Últimos 7 días' } }
  if (clave === 'mes') return { ok: true, periodo: { clave, desde: `${hoy.slice(0, 8)}01`, hasta: ultimoDiaDelMes(hoy), etiqueta: 'Este mes' } }
  // '30d', y también 'personalizado' sin fechas (todavía no eligió el rango).
  return { ok: true, periodo: { clave: '30d', desde: sumarDias(hoy, -29), hasta: hoy, etiqueta: 'Últimos 30 días' } }
}
