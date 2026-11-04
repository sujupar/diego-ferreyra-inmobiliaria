/**
 * Embudo por canal: de la inversión en Meta hasta las captaciones.
 *
 * Dos formas de contar (conmutador del bloque 2):
 *  - 'eventos': cada paso se cuenta en la fecha en que OCURRIÓ. Responde "¿cuántas
 *    tasaciones hicimos esta semana?".
 *  - 'cohorte': de las personas que pidieron en el período, cuántas llegaron a
 *    cada paso (hasta hoy). Responde "¿qué % de los que piden termina captado?".
 *    Es la que usa el documento "Meta y embudos mes a mes".
 */

import { ETAPAS, type Embudo, type Etapa, type Persona } from './personas'
import { clave, claves, enRango, type Agrupar, type Rango } from './rango'

export type EmbudoCampania = Embudo | 'propiedad'

/** Mismo criterio que el Mapa de métricas: por el nombre de la campaña. */
export function embudoDeCampania(nombre: string | null | undefined): EmbudoCampania {
  const n = (nombre ?? '').toLowerCase()
  if (n.includes('tasaci')) return 'tasacion'
  if (n.includes('clase')) return 'clase'
  return 'propiedad'
}

export interface MetaDia {
  fecha: string
  campania: string
  /** ARS */
  gasto: number
  impresiones: number
  clics: number
  visitasMeta: number
}

export interface VisitaDia { fecha: string; embudo: Embudo; variante: string; visitas: number }

/** Tasa del blue por fecha (ARS por USD). Fin de semana = último día hábil. */
export type Blue = (fecha: string) => number | null

/**
 * Desde cuándo se cuentan las visitas propias de cada landing: las landings
 * propias salieron el 20/7/2026 (en junio la medición registró apenas 17
 * cargas, no sirve). Antes se usa la visita que mide Meta; y para tasación nov-25 a mar-26 Meta no las midió bien
 * (el documento las muestra como "—"), así que esos días quedan sin dato.
 */
export const VISITAS_PROPIAS_DESDE = '2026-07-20'
export const VISITAS_META_SIN_DATO: Record<Embudo, Rango | null> = {
  tasacion: { desde: '2025-11-01', hasta: '2026-03-31' },
  clase: null,
}

/**
 * Hasta esta fecha el sistema viejo no registraba la visita de tasación: las
 * "realizadas" de esas solicitudes figuran en 0 (el documento validado las
 * muestra "s/d"). La pantalla lo avisa cuando el rango llega a esos meses.
 */
export const REALIZADAS_SIN_DATO_HASTA = '2026-02-28'

export interface Paso {
  etapa: Etapa
  cantidad: number
  /** % sobre el paso anterior (null en el primero o si el anterior es 0). */
  pctPaso: number | null
  /** % sobre las solicitudes. */
  pctSolicitud: number | null
  /** USD de inversión por cada uno. */
  costoUsd: number | null
}

export interface ResumenCanal {
  embudo: Embudo
  inversionUsd: number
  /** Días del rango con gasto cargado (cobertura de la inversión). */
  diasConGasto: number
  impresiones: number
  clics: number
  /** null = no hay dato de visitas para ningún día del rango. */
  visitas: number | null
  /** Solicitudes de los días que SÍ tienen dato de visitas (para la conversión). */
  solicitudesConVisitas: number
  conversionLanding: number | null
  costoPorClic: number | null
  pasos: Paso[]
  /** Personas que entraron por el sistema viejo (fechas por etapa aproximadas). */
  historicas: number
}

export interface EntradaEmbudo {
  personas: Persona[]
  meta: MetaDia[]
  visitas: VisitaDia[]
  blue: Blue
  rango: Rango
  vista: 'eventos' | 'cohorte'
}

const div = (a: number, b: number) => (b ? a / b : null)

function visitasDelDia(e: Embudo, fecha: string, propias: number, meta: number): number | null {
  if (fecha >= VISITAS_PROPIAS_DESDE) return propias
  const sin = VISITAS_META_SIN_DATO[e]
  if (sin && enRango(fecha, sin)) return null
  return meta
}

/** Cuántas personas llegaron a cada paso, según la vista. */
export function contarPasos(personas: Persona[], r: Rango, vista: 'eventos' | 'cohorte'): Record<Etapa, number> {
  const out = Object.fromEntries(ETAPAS.map(e => [e, 0])) as Record<Etapa, number>
  for (const p of personas) {
    if (vista === 'cohorte') {
      if (!enRango(p.fechas.solicitud, r)) continue
      for (const e of ETAPAS) if (p.fechas[e]) out[e]++
    } else {
      for (const e of ETAPAS) if (enRango(p.fechas[e], r)) out[e]++
    }
  }
  return out
}

export function resumirCanal(embudo: Embudo, x: EntradaEmbudo): ResumenCanal {
  const personas = x.personas.filter(p => p.embudo === embudo)
  let inversionUsd = 0, impresiones = 0, clics = 0
  const metaVisitasDia = new Map<string, number>(), gastoDias = new Set<string>()
  for (const m of x.meta) {
    if (embudoDeCampania(m.campania) !== embudo || !enRango(m.fecha, x.rango)) continue
    const tasa = x.blue(m.fecha)
    if (m.gasto > 0) {
      gastoDias.add(m.fecha)
      if (tasa) inversionUsd += m.gasto / tasa
    }
    impresiones += m.impresiones
    clics += m.clics
    metaVisitasDia.set(m.fecha, (metaVisitasDia.get(m.fecha) ?? 0) + m.visitasMeta)
  }
  const propiasDia = new Map<string, number>()
  for (const v of x.visitas) {
    if (v.embudo !== embudo || !enRango(v.fecha, x.rango)) continue
    propiasDia.set(v.fecha, (propiasDia.get(v.fecha) ?? 0) + v.visitas)
  }
  const solicitudesDia = new Map<string, number>()
  for (const p of personas) {
    const f = p.fechas.solicitud
    if (f && enRango(f, x.rango)) solicitudesDia.set(f, (solicitudesDia.get(f) ?? 0) + 1)
  }
  let visitas: number | null = null, solicitudesConVisitas = 0
  for (const f of claves(x.rango, 'dia')) {
    const v = visitasDelDia(embudo, f, propiasDia.get(f) ?? 0, metaVisitasDia.get(f) ?? 0)
    if (v == null) continue
    visitas = (visitas ?? 0) + v
    solicitudesConVisitas += solicitudesDia.get(f) ?? 0
  }

  const cuenta = contarPasos(personas, x.rango, x.vista)
  const pasos: Paso[] = ETAPAS.map((etapa, i) => {
    const cantidad = cuenta[etapa]
    const prev = i ? cuenta[ETAPAS[i - 1]] : null
    return {
      etapa,
      cantidad,
      pctPaso: prev == null ? null : div(cantidad, prev),
      pctSolicitud: div(cantidad, cuenta.solicitud),
      costoUsd: cantidad && inversionUsd ? inversionUsd / cantidad : null,
    }
  })
  return {
    embudo,
    inversionUsd,
    diasConGasto: gastoDias.size,
    impresiones,
    clics,
    visitas,
    solicitudesConVisitas,
    conversionLanding: visitas ? solicitudesConVisitas / visitas : null,
    costoPorClic: div(inversionUsd, clics),
    pasos,
    historicas: personas.filter(p => p.historico && enRango(p.fechas.solicitud, x.rango)).length,
  }
}

export interface PuntoSerie {
  clave: string
  inversionUsd: number
  visitas: number | null
  solicitudes: number
  conversion: number | null
  agendadas: number
  realizadas: number
  captadas: number
}

/** Serie en el tiempo de un embudo, contando por eventos (cada paso en su fecha). */
export function serie(embudo: Embudo, x: Omit<EntradaEmbudo, 'vista'>, agrupar: Agrupar): PuntoSerie[] {
  const ks = claves(x.rango, agrupar)
  const P = new Map(ks.map(k => [k, { clave: k, inversionUsd: 0, visitas: null as number | null, solicitudes: 0, solConVisita: 0, agendadas: 0, realizadas: 0, captadas: 0 }]))
  const metaV = new Map<string, number>(), propias = new Map<string, number>()
  for (const m of x.meta) {
    if (embudoDeCampania(m.campania) !== embudo || !enRango(m.fecha, x.rango)) continue
    const t = x.blue(m.fecha)
    if (t && m.gasto > 0) P.get(clave(m.fecha, agrupar))!.inversionUsd += m.gasto / t
    metaV.set(m.fecha, (metaV.get(m.fecha) ?? 0) + m.visitasMeta)
  }
  for (const v of x.visitas) if (v.embudo === embudo && enRango(v.fecha, x.rango)) propias.set(v.fecha, (propias.get(v.fecha) ?? 0) + v.visitas)
  const conVisita = new Set<string>()
  for (const f of claves(x.rango, 'dia')) {
    const v = visitasDelDia(embudo, f, propias.get(f) ?? 0, metaV.get(f) ?? 0)
    if (v == null) continue
    conVisita.add(f)
    const p = P.get(clave(f, agrupar))!
    p.visitas = (p.visitas ?? 0) + v
  }
  for (const pe of x.personas) {
    if (pe.embudo !== embudo) continue
    const s = pe.fechas.solicitud
    if (enRango(s, x.rango)) {
      const p = P.get(clave(s!, agrupar))!
      p.solicitudes++
      if (conVisita.has(s!)) p.solConVisita++
    }
    if (enRango(pe.fechas.agendada, x.rango)) P.get(clave(pe.fechas.agendada!, agrupar))!.agendadas++
    if (enRango(pe.fechas.realizada, x.rango)) P.get(clave(pe.fechas.realizada!, agrupar))!.realizadas++
    if (enRango(pe.fechas.captada, x.rango)) P.get(clave(pe.fechas.captada!, agrupar))!.captadas++
  }
  return [...P.values()].map(({ solConVisita, ...p }) => ({ ...p, conversion: p.visitas ? solConVisita / p.visitas : null }))
}

export interface LandingVariante { embudo: Embudo; variante: string; visitas: number; solicitudes: number; conversion: number | null }

/** Conversión por landing y versión A/B (solo días con visitas propias). */
export function porVariante(personas: Persona[], visitas: VisitaDia[], r: Rango): LandingVariante[] {
  const M = new Map<string, LandingVariante>()
  const k = (e: Embudo, v: string) => `${e}|${v}`
  for (const v of visitas) {
    if (!enRango(v.fecha, r)) continue
    const key = k(v.embudo, v.variante)
    const x = M.get(key) ?? { embudo: v.embudo, variante: v.variante, visitas: 0, solicitudes: 0, conversion: null }
    x.visitas += v.visitas
    M.set(key, x)
  }
  for (const p of personas) {
    const f = p.fechas.solicitud
    if (!enRango(f, r) || f! < VISITAS_PROPIAS_DESDE) continue
    const key = k(p.embudo, p.variante ?? '-')
    const x = M.get(key)
    if (x) x.solicitudes++
  }
  return [...M.values()].map(x => ({ ...x, conversion: div(x.solicitudes, x.visitas) }))
    .sort((a, b) => a.embudo.localeCompare(b.embudo) || b.visitas - a.visitas)
}

/** Tasa del blue a partir de la serie de bluelytics. */
export function armarBlue(serie: { date: string; source: string; value_buy: number; value_sell: number }[]): Blue {
  const m = new Map<string, number>()
  for (const x of serie) if (x.source === 'Blue') m.set(x.date, (x.value_buy + x.value_sell) / 2)
  const fechas = [...m.keys()].sort()
  return (fecha: string) => {
    if (m.has(fecha)) return m.get(fecha)!
    // Último día con cotización anterior a la fecha (búsqueda binaria).
    let lo = 0, hi = fechas.length - 1, res: string | null = null
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (fechas[mid] <= fecha) { res = fechas[mid]; lo = mid + 1 } else hi = mid - 1
    }
    return res ? m.get(res)! : null
  }
}
