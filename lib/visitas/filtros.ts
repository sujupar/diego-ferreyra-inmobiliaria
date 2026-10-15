/**
 * Parámetros de GET /api/visits y GET /api/visits/resumen, validados en el SERVIDOR
 * (spec §4.4). Puro. Todo lo que no cuadra es un 400 con mensaje en castellano, antes
 * de tocar la base.
 *
 * Acepta también los nombres VIEJOS de GET /api/visits (`from`, `to`, `advisor_id`,
 * `property_id`, `status`): los usan /inicio ("Visitas de hoy") y /tasks ("Visitas
 * pendientes de marcar"), y una pestaña abierta con el código anterior al deploy
 * también. Si dos nombres traen valor, gana el nuevo.
 */
import { ESTADOS_VISITA, ESTADOS_ACTIVOS, esEstadoVisita, type EstadoVisita } from './transiciones'
import { ORIGENES_VISITA } from './origen'
import { validarRango } from './periodo'
import { esFechaDeCalendario, inicioDelDiaArgentina, finDelDiaArgentina } from '@/lib/filters/rango-fechas'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INSTANTE_RE = /^\d{4}-\d{2}-\d{2}T/

export const FILTROS_ORIGEN = [...ORIGENES_VISITA, 'sin_origen'] as const
export type FiltroOrigen = (typeof FILTROS_ORIGEN)[number]
export const ESTADOS_FILTRO = [...ESTADOS_VISITA, 'activas', 'sin_resultado'] as const
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number]
export const POR_PAGINA_DEFECTO = 50
export const POR_PAGINA_MAX = 200

export interface FiltrosComunes {
  asesorId: string | null
  propiedadId: string | null
  origen: FiltroOrigen | null
}
export interface FiltrosResumen extends FiltrosComunes {
  desde: string
  hasta: string
}
export interface FiltrosLista extends FiltrosComunes {
  desdeInstante: string | null
  hastaInstante: string | null
  estados: EstadoVisita[] | null
  pagina: number
  porPagina: number
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }

export function esFiltroOrigen(v: string): v is FiltroOrigen {
  return (FILTROS_ORIGEN as readonly string[]).includes(v)
}

function esEstadoFiltro(v: string): v is EstadoFiltro {
  return (ESTADOS_FILTRO as readonly string[]).includes(v)
}

function primero(sp: URLSearchParams, ...claves: string[]): string | null {
  for (const clave of claves) {
    const v = sp.get(clave)?.trim()
    if (v) return v
  }
  return null
}

/** Milisegundos de un instante, tolerando los microsegundos de `finDelDiaArgentina`. */
function ms(instante: string): number {
  return Date.parse(instante.replace(/(\.\d{3})\d+/, '$1'))
}

/** Un día AAAA-MM-DD (se pasa al día argentino) o un instante ISO (se normaliza). `null` si no sirve. */
function aInstante(valor: string, punta: 'inicio' | 'fin'): string | null {
  if (esFechaDeCalendario(valor)) {
    if (validarRango(valor, valor)) return null // fecha que no existe (2026-02-31)
    return punta === 'inicio' ? inicioDelDiaArgentina(valor) : finDelDiaArgentina(valor)
  }
  if (!INSTANTE_RE.test(valor)) return null
  const t = Date.parse(valor)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

function entero(v: string | null, defecto: number, min: number, max: number): number | null {
  if (v === null || v.trim() === '') return defecto
  if (!/^\d+$/.test(v.trim())) return null
  const n = Number(v)
  return n >= min && n <= max ? n : null
}

function leerComunes(sp: URLSearchParams): Resultado<FiltrosComunes> {
  const asesorId = primero(sp, 'asesor', 'advisor_id')
  if (asesorId && !UUID_RE.test(asesorId)) return { ok: false, error: 'El asesor no es válido' }
  const propiedadId = primero(sp, 'propiedad', 'property_id')
  if (propiedadId && !UUID_RE.test(propiedadId)) return { ok: false, error: 'La propiedad no es válida' }
  const origen = primero(sp, 'origen')
  if (origen && !esFiltroOrigen(origen)) return { ok: false, error: 'El origen no es válido' }
  return { ok: true, valor: { asesorId, propiedadId, origen: origen && esFiltroOrigen(origen) ? origen : null } }
}

export function leerFiltrosResumen(sp: URLSearchParams): Resultado<FiltrosResumen> {
  const comunes = leerComunes(sp)
  if (!comunes.ok) return comunes
  const desde = sp.get('desde')?.trim() ?? ''
  const hasta = sp.get('hasta')?.trim() ?? ''
  const error = validarRango(desde, hasta)
  if (error) return { ok: false, error }
  return { ok: true, valor: { ...comunes.valor, desde, hasta } }
}

export function leerFiltrosLista(sp: URLSearchParams, ahora: Date): Resultado<FiltrosLista> {
  const comunes = leerComunes(sp)
  if (!comunes.ok) return comunes

  const desdeCrudo = primero(sp, 'desde', 'from')
  const desdeInstante = desdeCrudo ? aInstante(desdeCrudo, 'inicio') : null
  if (desdeCrudo && !desdeInstante) return { ok: false, error: 'La fecha "desde" no es válida' }
  const hastaCrudo = primero(sp, 'hasta', 'to')
  let hastaInstante = hastaCrudo ? aInstante(hastaCrudo, 'fin') : null
  if (hastaCrudo && !hastaInstante) return { ok: false, error: 'La fecha "hasta" no es válida' }

  const estado = primero(sp, 'estado', 'status')
  if (estado && !esEstadoFiltro(estado)) return { ok: false, error: 'El estado no es válido' }
  let estados: EstadoVisita[] | null = null
  if (estado === 'activas' || estado === 'sin_resultado') estados = [...ESTADOS_ACTIVOS]
  else if (estado && esEstadoVisita(estado)) estados = [estado]
  // "Sin resultado" = activas cuyo horario YA pasó: el tope es ahora (o antes, si lo pidieron).
  if (estado === 'sin_resultado' && (!hastaInstante || ms(hastaInstante) > ahora.getTime())) {
    hastaInstante = ahora.toISOString()
  }

  const pagina = entero(sp.get('pagina'), 1, 1, 10_000)
  if (pagina === null) return { ok: false, error: 'La página no es válida' }
  const porPagina = entero(sp.get('porPagina'), POR_PAGINA_DEFECTO, 1, POR_PAGINA_MAX)
  if (porPagina === null) return { ok: false, error: 'La cantidad por página no es válida' }

  return { ok: true, valor: { ...comunes.valor, desdeInstante, hastaInstante, estados, pagina, porPagina } }
}
