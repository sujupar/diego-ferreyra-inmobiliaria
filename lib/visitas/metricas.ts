/**
 * Métricas de la sección Visitas — definiciones EXACTAS de la spec §4.5 (las que no
 * dependen de la encuesta; esas llegan en la Entrega 3). Módulo puro: recibe filas ya
 * filtradas por período/alcance (lib/visitas/datos.ts) y devuelve números con su base.
 *
 * Regla del tablero (CLAUDE.md § Tablero): toda cifra viaja con su base; base 0 ⇒
 * `valor: null` ⇒ "Sin datos", nunca 0; porcentajes y medianas con base < 20 ⇒
 * "orientativo". Un conteo no es una estimación: nunca es orientativo.
 */
import type { VisitaListado } from './tipos'
import { ESTADOS_ACTIVOS, MOTIVO_ETIQUETA, type MotivoNoRealizada } from './transiciones'
import { ORIGEN_INFO } from './origen'

export const BASE_ORIENTATIVA = 20

export interface Cifra {
  valor: number | null
  base: number
  orientativo: boolean
}

export function cifra(valor: number, base: number): Cifra {
  if (base <= 0) return { valor: null, base: 0, orientativo: false }
  return { valor, base, orientativo: base < BASE_ORIENTATIVA }
}

export function conteo(n: number): Cifra {
  return n > 0 ? { valor: n, base: n, orientativo: false } : { valor: null, base: 0, orientativo: false }
}

export function porcentaje(parte: number, base: number): Cifra {
  return base > 0 ? cifra(Math.round((parte / base) * 100), base) : cifra(0, 0)
}

export function mediana(valores: readonly number[]): Cifra {
  if (valores.length === 0) return cifra(0, 0)
  const ordenados = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(ordenados.length / 2)
  const valor = ordenados.length % 2 === 1 ? ordenados[medio] : (ordenados[medio - 1] + ordenados[medio]) / 2
  return cifra(valor, ordenados.length)
}

export interface MotivoContado {
  clave: MotivoNoRealizada | 'sin_motivo'
  etiqueta: string
  cantidad: number
}

export interface ConteosVisitas {
  agendadas: Cifra
  /** % sobre las visitas CON resultado (estado final). */
  realizadas: Cifra
  conteos: { realizadas: number; noRealizadas: number; canceladas: number; conResultado: number }
  /** Activas cuya hora ya pasó: no entran en la base del %. Se muestran aparte. */
  sinMarcar: number
  noSeHicieron: { total: Cifra; porMotivo: MotivoContado[] }
}

function esActiva(v: VisitaListado): boolean {
  return ESTADOS_ACTIVOS.includes(v.status)
}

export function contarVisitas(visitas: readonly VisitaListado[], ahora: Date): ConteosVisitas {
  const t = ahora.getTime()
  let realizadas = 0
  let noRealizadas = 0
  let canceladas = 0
  let sinMarcar = 0
  const motivos = new Map<MotivoNoRealizada | 'sin_motivo', number>()
  for (const v of visitas) {
    if (v.status === 'completed') realizadas++
    else if (v.status === 'no_show' || v.status === 'cancelled') {
      if (v.status === 'no_show') noRealizadas++
      else canceladas++
      const clave = v.outcome_reason ?? 'sin_motivo'
      motivos.set(clave, (motivos.get(clave) ?? 0) + 1)
    } else if (esActiva(v) && Date.parse(v.scheduled_at) < t) sinMarcar++
  }
  const agendadas = visitas.length
  const conResultado = realizadas + noRealizadas + canceladas
  const porMotivo: MotivoContado[] = [...motivos.entries()]
    .map(([clave, cantidad]) => ({ clave, etiqueta: clave === 'sin_motivo' ? 'Sin motivo' : MOTIVO_ETIQUETA[clave], cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, 'es'))
  return {
    agendadas: conteo(agendadas),
    realizadas: porcentaje(realizadas, conResultado),
    conteos: { realizadas, noRealizadas, canceladas, conResultado },
    sinMarcar,
    noSeHicieron: { total: cifra(noRealizadas + canceladas, agendadas), porMotivo },
  }
}

export interface PasoEmbudo {
  clave: 'agendadas' | 'confirmadas' | 'realizadas' | 'respondieron' | 'ofertarian'
  etiqueta: string
  cantidad: number
  saltoMasGrande: boolean
}

/**
 * Agendadas → Confirmadas → Se realizaron → Respondieron la encuesta → Dijeron cuánto
 * ofertarían (spec §3.4). "Confirmadas" = tuvieron `confirmed_at` O se realizaron (el
 * embudo nunca sube). Los dos pasos de la encuesta compiten por el "salto más grande"
 * SOLO si alguna realizada del período tiene encuesta: las visitas anteriores a la
 * Entrega 3 no tienen link y no son "no respondió".
 */
export function armarEmbudo(visitas: readonly VisitaListado[]): PasoEmbudo[] {
  let confirmadas = 0
  let realizadas = 0
  let respondieron = 0
  let ofertarian = 0
  let conEncuesta = false
  for (const v of visitas) {
    if (v.status === 'completed') {
      realizadas++; confirmadas++
      if (v.encuesta) conEncuesta = true
      if (v.encuesta?.completed_at) {
        respondieron++
        if (v.encuesta.offer_amount !== null) ofertarian++
      }
    } else if (v.confirmed_at) confirmadas++
  }
  const pasos: Omit<PasoEmbudo, 'saltoMasGrande'>[] = [
    { clave: 'agendadas', etiqueta: 'Agendadas', cantidad: visitas.length },
    { clave: 'confirmadas', etiqueta: 'Confirmadas', cantidad: confirmadas },
    { clave: 'realizadas', etiqueta: 'Se realizaron', cantidad: realizadas },
    { clave: 'respondieron', etiqueta: 'Respondieron la encuesta', cantidad: respondieron },
    { clave: 'ofertarian', etiqueta: 'Dijeron cuánto ofertarían', cantidad: ofertarian },
  ]
  const hasta = conEncuesta ? pasos.length : 3
  let indiceSalto = -1
  let mayorCaida = 0
  for (let i = 1; i < hasta; i++) {
    const anterior = pasos[i - 1].cantidad
    if (anterior <= 0) continue
    const caida = (anterior - pasos[i].cantidad) / anterior
    if (caida > mayorCaida) { mayorCaida = caida; indiceSalto = i }
  }
  return pasos.map((p, i) => ({ ...p, saltoMasGrande: i === indiceSalto }))
}

export interface ConteoEncuestas { respondidas: Cifra; completas: number; conOferta: number }

/**
 * "Encuestas respondidas %" = encuestas completas ÷ visitas realizadas del período (spec §4.5).
 * Si NINGUNA realizada del período tiene encuesta (todas de antes de la Entrega 3, o la encuesta
 * ni se creó), "Sin datos" — no "0%": un 0% dice "nadie respondió", y acá nadie tenía nada para
 * responder. Mismo guard `conEncuesta` que usa armarEmbudo.
 */
export function contarEncuestas(visitas: readonly VisitaListado[]): ConteoEncuestas {
  let realizadas = 0
  let completas = 0
  let conOferta = 0
  let conEncuesta = false
  for (const v of visitas) {
    if (v.status !== 'completed') continue
    realizadas++
    if (v.encuesta) conEncuesta = true
    if (v.encuesta?.completed_at) {
      completas++
      if (v.encuesta.offer_amount !== null) conOferta++
    }
  }
  return { respondidas: conEncuesta ? porcentaje(completas, realizadas) : cifra(0, 0), completas, conOferta }
}

/** Un registro de comprador creado a menos de esto de la visita nació CON ella (cartel, a mano). */
export const MARGEN_REGISTRO_CON_LA_VISITA_MS = 2 * 60_000

export interface TiemposVisitas {
  anticipacion: Cifra
  confirmacion: Cifra
  marcarResultado: Cifra
  consultaAVisita: Cifra
  respuestaEncuesta: Cifra
}

/** Medianas en MILISEGUNDOS. Las guardas de cada una están explicadas en el plan de la Entrega 2 (Tarea 3). */
export function tiemposDeVisitas(visitas: readonly VisitaListado[]): TiemposVisitas {
  const anticipacion: number[] = []
  const confirmacion: number[] = []
  const marcar: number[] = []
  const consulta: number[] = []
  const respuesta: number[] = []
  for (const v of visitas) {
    const creada = Date.parse(v.created_at)
    const cuando = Date.parse(v.scheduled_at)
    if (cuando - creada >= 0) anticipacion.push(cuando - creada)
    if (v.confirmed_at) {
      const d = Date.parse(v.confirmed_at) - creada
      if (d > 0) confirmacion.push(d)
    }
    if ((v.status === 'completed' || v.status === 'no_show') && v.outcome_at) {
      marcar.push(Math.max(0, Date.parse(v.outcome_at) - cuando))
    }
    if (v.consulta_recibida_at) {
      const d = creada - Date.parse(v.consulta_recibida_at)
      if (d >= 0) consulta.push(d)
    } else if (v.registro_creado_at) {
      const d = creada - Date.parse(v.registro_creado_at)
      if (d >= MARGEN_REGISTRO_CON_LA_VISITA_MS) consulta.push(d)
    }
    if (v.encuesta?.sent_at && v.encuesta.completed_at) {
      const d = Date.parse(v.encuesta.completed_at) - Date.parse(v.encuesta.sent_at)
      if (d >= 0) respuesta.push(d)
    }
  }
  return {
    anticipacion: mediana(anticipacion),
    confirmacion: mediana(confirmacion),
    marcarResultado: mediana(marcar),
    consultaAVisita: mediana(consulta),
    respuestaEncuesta: mediana(respuesta),
  }
}

export interface FilaGrupo {
  clave: string
  etiqueta: string
  cantidad: number
  /** % realizado sobre las visitas del grupo con resultado. */
  realizado: Cifra
}

interface Acumulado { etiqueta: string; cantidad: number; realizadas: number; conResultado: number }

function agrupar(visitas: readonly VisitaListado[], claveDe: (v: VisitaListado) => { clave: string; etiqueta: string }): FilaGrupo[] {
  const grupos = new Map<string, Acumulado>()
  for (const v of visitas) {
    const { clave, etiqueta } = claveDe(v)
    const g = grupos.get(clave) ?? { etiqueta, cantidad: 0, realizadas: 0, conResultado: 0 }
    g.cantidad++
    if (v.status === 'completed') { g.realizadas++; g.conResultado++ }
    else if (v.status === 'no_show' || v.status === 'cancelled') g.conResultado++
    grupos.set(clave, g)
  }
  return [...grupos.entries()]
    .map(([clave, g]) => ({ clave, etiqueta: g.etiqueta, cantidad: g.cantidad, realizado: porcentaje(g.realizadas, g.conResultado) }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

export function porOrigen(visitas: readonly VisitaListado[]): FilaGrupo[] {
  return agrupar(visitas, v => v.origin
    ? { clave: v.origin, etiqueta: ORIGEN_INFO[v.origin].etiqueta }
    : { clave: 'sin_origen', etiqueta: 'Sin origen' })
}

export function porAsesor(visitas: readonly VisitaListado[]): FilaGrupo[] {
  return agrupar(visitas, v => v.advisor_id
    ? { clave: v.advisor_id, etiqueta: v.asesor_nombre?.trim() || 'Asesor sin nombre' }
    : { clave: 'sin_asesor', etiqueta: 'Sin asesor' })
}

export function porPropiedad(visitas: readonly VisitaListado[]): FilaGrupo[] {
  return agrupar(visitas, v => ({ clave: v.property_id, etiqueta: v.direccion?.trim() || 'Propiedad sin dirección' }))
}

export interface Metricas extends ConteosVisitas {
  tiempos: TiemposVisitas
  embudo: PasoEmbudo[]
  porOrigen: FilaGrupo[]
  porAsesor: FilaGrupo[]
  porPropiedad: FilaGrupo[]
  encuestas: ConteoEncuestas
}

export function calcularMetricas(visitas: readonly VisitaListado[], ahora: Date): Metricas {
  return {
    ...contarVisitas(visitas, ahora),
    tiempos: tiemposDeVisitas(visitas),
    embudo: armarEmbudo(visitas),
    porOrigen: porOrigen(visitas),
    porAsesor: porAsesor(visitas),
    porPropiedad: porPropiedad(visitas),
    encuestas: contarEncuestas(visitas),
  }
}
