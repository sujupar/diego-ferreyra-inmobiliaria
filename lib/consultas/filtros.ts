/**
 * Filtros de la bandeja de Consultas, leídos de la dirección (`/consultas?…`).
 *
 * El período reusa el de Visitas (`resolverPeriodo`) para que las dos pantallas
 * entiendan las mismas URLs, con dos diferencias: existe `hoy`, y el defecto es
 * `7d` —las consultas son de todos los días y 30 días de golpe es una pared—.
 * Lo que no se entiende se IGNORA (vuelve al defecto) en vez de romper la
 * pantalla: una URL vieja o mal copiada tiene que seguir abriendo la bandeja.
 * El único error es un rango de fechas imposible, porque ahí no hay defecto
 * honesto que elegir.
 * Módulo puro y seguro para el navegador.
 */
import { resolverPeriodo } from '@/lib/visitas/periodo'
import { sumarDias } from '@/lib/visitas/horario'
import { normalizarBusqueda } from '@/lib/filters/busqueda-texto'

export const PERIODOS_CONSULTAS = ['hoy', '7d', '30d', 'mes', 'personalizado'] as const
export type PeriodoConsultas = (typeof PERIODOS_CONSULTAS)[number]

export const FILTROS_DEFECTO_CONSULTAS = {
  periodo: '7d', from: '', to: '', portal: '', propiedad: '', estado: '', asesor: '', telefono: '', q: '',
}

export const PORTALES_FILTRO = ['zonaprop', 'argenprop', 'mercadolibre', 'landing'] as const
export const ESTADOS_FILTRO = ['sin_visita', 'con_visita', 'visito'] as const
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number]

/** Valor de `?telefono=` que muestra solo los teléfonos a revisar. */
export const TELEFONO_REVISAR = 'revisar'

export interface FiltrosConsultas {
  desde: string
  hasta: string
  etiqueta: string
  portal: string | null
  propiedad: string | 'sin' | null
  estado: EstadoFiltro | null
  asesor: string | 'sin' | null
  telefonoRevisar: boolean
  q: string
  pagina: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function esDeCatalogo<T extends string>(catalogo: readonly T[], v: string | null): v is T {
  return catalogo.some((valor) => valor === v)
}

function deCatalogo<T extends string>(catalogo: readonly T[], v: string | null): T | null {
  return esDeCatalogo(catalogo, v) ? v : null
}

/** uuid o `'sin'` (consultas sin propiedad / sin asesor). Otro valor → sin filtro. */
function idOSin(v: string | null): string | 'sin' | null {
  const limpio = v?.trim() ?? ''
  if (limpio === 'sin') return 'sin'
  return UUID.test(limpio) ? limpio.toLowerCase() : null
}

function leerPagina(v: string | null): number {
  if (v === null || !/^\d+$/.test(v.trim())) return 1
  const n = Number(v.trim())
  return Number.isSafeInteger(n) && n >= 1 ? n : 1
}

function leerPeriodo(
  sp: URLSearchParams,
  hoy: string,
): { ok: true; desde: string; hasta: string; etiqueta: string } | { ok: false; error: string } {
  const from = sp.get('from')?.trim() ?? ''
  const to = sp.get('to')?.trim() ?? ''
  const periodo = sp.get('periodo')
  // Con fechas manda el rango, como en Visitas (resolverPeriodo lo valida).
  if (from || to || periodo === '30d' || periodo === 'mes') {
    const r = resolverPeriodo({ periodo, from, to }, hoy)
    if (!r.ok) return r
    return { ok: true, desde: r.periodo.desde, hasta: r.periodo.hasta, etiqueta: r.periodo.etiqueta }
  }
  if (periodo === 'hoy') return { ok: true, desde: hoy, hasta: hoy, etiqueta: 'Hoy' }
  // '7d', vacío, desconocido o 'personalizado' sin fechas: el defecto de esta
  // sección. No se delega en resolverPeriodo porque su defecto es 30 días.
  return { ok: true, desde: sumarDias(hoy, -6), hasta: hoy, etiqueta: 'Últimos 7 días' }
}

export function leerFiltrosConsultas(
  sp: URLSearchParams,
  hoy: string,
): { ok: true; valor: FiltrosConsultas } | { ok: false; error: string } {
  const periodo = leerPeriodo(sp, hoy)
  if (!periodo.ok) return periodo
  return {
    ok: true,
    valor: {
      desde: periodo.desde,
      hasta: periodo.hasta,
      etiqueta: periodo.etiqueta,
      portal: deCatalogo(PORTALES_FILTRO, sp.get('portal')),
      propiedad: idOSin(sp.get('propiedad')),
      estado: deCatalogo(ESTADOS_FILTRO, sp.get('estado')),
      asesor: idOSin(sp.get('asesor')),
      telefonoRevisar: sp.get('telefono') === TELEFONO_REVISAR,
      q: normalizarBusqueda(sp.get('q') ?? ''),
      pagina: leerPagina(sp.get('pagina')),
    },
  }
}
