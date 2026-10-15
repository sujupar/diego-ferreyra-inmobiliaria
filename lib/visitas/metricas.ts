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
  clave: 'agendadas' | 'confirmadas' | 'realizadas'
  etiqueta: string
  cantidad: number
  saltoMasGrande: boolean
}

/**
 * Agendadas → Confirmadas → Se realizaron (los dos pasos de la encuesta llegan en la
 * Entrega 3). "Confirmadas" = tuvieron `confirmed_at` O se realizaron: una visita
 * marcada "Se realizó" sin pasar por "Confirmar" igual ocurrió, y así el embudo nunca
 * sube. Se resalta SOLO el paso con la mayor caída relativa (patrón "emphasis" de
 * CLAUDE.md § Tablero): el resto va en gris.
 */
export function armarEmbudo(visitas: readonly VisitaListado[]): PasoEmbudo[] {
  let confirmadas = 0
  let realizadas = 0
  for (const v of visitas) {
    if (v.status === 'completed') { realizadas++; confirmadas++ }
    else if (v.confirmed_at) confirmadas++
  }
  const pasos: Omit<PasoEmbudo, 'saltoMasGrande'>[] = [
    { clave: 'agendadas', etiqueta: 'Agendadas', cantidad: visitas.length },
    { clave: 'confirmadas', etiqueta: 'Confirmadas', cantidad: confirmadas },
    { clave: 'realizadas', etiqueta: 'Se realizaron', cantidad: realizadas },
  ]
  let indiceSalto = -1
  let mayorCaida = 0
  for (let i = 1; i < pasos.length; i++) {
    const anterior = pasos[i - 1].cantidad
    if (anterior <= 0) continue
    const caida = (anterior - pasos[i].cantidad) / anterior
    if (caida > mayorCaida) { mayorCaida = caida; indiceSalto = i }
  }
  return pasos.map((p, i) => ({ ...p, saltoMasGrande: i === indiceSalto }))
}
