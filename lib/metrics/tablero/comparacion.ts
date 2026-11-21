/**
 * Contra qué período compara el Tablero cuando se elige un mes o "el mejor mes".
 * Módulo puro.
 *
 * Regla del dueño (2026-11-21): siempre se comparan LOS MISMOS DÍAS. Del 1 al 20
 * de noviembre contra enero es del 1 al 20 de enero; comparar 20 días contra un
 * mes entero haría parecer que noviembre se cayó.
 */

import { diasEntre, sumarDias, type Rango } from '../panel/rango'

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/

const ultimoDia = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()
const finDeMes = (ym: string) => `${ym}-${String(ultimoDia(ym)).padStart(2, '0')}`

/** ¿El rango es un mes calendario completo? */
const esMesCompleto = (r: Rango) => r.desde.slice(0, 7) === r.hasta.slice(0, 7) && r.desde.endsWith('-01') && r.hasta === finDeMes(r.hasta.slice(0, 7))

/**
 * El tramo equivalente al período `r` dentro del mes `ym` ('YYYY-MM').
 *  - Si `r` es un mes cerrado, es el mes `ym` entero.
 *  - Si no, arranca el mismo día del mes (o el último, si ese día no existe) y
 *    dura lo mismo que `r`.
 * null si el mes está mal escrito.
 */
export function tramoEnMes(r: Rango, ym: string): Rango | null {
  if (!MES.test(ym)) return null
  if (esMesCompleto(r)) return { desde: `${ym}-01`, hasta: finDeMes(ym) }
  const dia = Math.min(Number(r.desde.slice(8)), ultimoDia(ym))
  const desde = `${ym}-${String(dia).padStart(2, '0')}`
  return { desde, hasta: sumarDias(desde, diasEntre(r) - 1) }
}

/** El mes 'YYYY-MM' entero. */
export const rangoDelMes = (ym: string): Rango => ({ desde: `${ym}-01`, hasta: finDeMes(ym) })

/** Meses del año de `hoy` anteriores al mes en curso ('YYYY-MM'). */
export function mesesCerradosDelAnio(hoy: string): string[] {
  const out: string[] = []
  for (let m = 1; m < Number(hoy.slice(5, 7)); m++) out.push(`${hoy.slice(0, 4)}-${String(m).padStart(2, '0')}`)
  return out
}

export interface CandidatoMes {
  mes: string
  /** Inversión de la campaña de tasación en el mes, USD al blue de cada día. */
  inversionUsd: number
  /** Personas que pidieron tasación en el mes. */
  solicitudes: number
  diasConGasto: number
  diasDelMes: number
}

/** Un mes con menos del 80 % de sus días con gasto tiene el dato incompleto: no compite. */
const MIN_DIAS_CON_GASTO = 0.8

/**
 * "El mejor mes" (decisión del dueño, 2026-11-21): el de menor costo por
 * solicitud de tasación. Empate: el que tuvo más solicitudes. null si ninguno
 * tiene datos completos.
 */
export function elegirMejorMes(candidatos: CandidatoMes[]): string | null {
  const validos = candidatos.filter(x => x.solicitudes > 0 && x.inversionUsd > 0 && x.diasConGasto >= x.diasDelMes * MIN_DIAS_CON_GASTO)
  validos.sort((a, b) => a.inversionUsd / a.solicitudes - b.inversionUsd / b.solicitudes || b.solicitudes - a.solicitudes)
  return validos[0]?.mes ?? null
}

/** Nombre del mes en castellano: '2026-01' → 'enero 2026'. */
export function nombreMes(ym: string): string {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${MESES[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`
}
