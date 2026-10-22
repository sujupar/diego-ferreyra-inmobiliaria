/**
 * Períodos del informe quincenal (spec §"Decisiones del dueño", punto 3). Puro: trabaja con fechas
 * de Argentina como texto 'AAAA-MM-DD' (las arma `fechaEnArgentina`); la aritmética se hace en UTC
 * sobre esas fechas, donde no hay cambios de horario que corran un día.
 *
 * - Ciclo FIJO (el del cron): el 1 y el 16 se cierra la quincena anterior.
 * - Ciclo DE LA PROPIEDAD: bloques de 15 días contados desde su captación (atajo de "Nuevo informe").
 */
export interface Periodo { desde: string; hasta: string }

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
const DIA_MS = 86_400_000
export const MAX_DIAS_PERIODO = 120

function aDia(fecha: string): number | null {
  const m = FECHA.exec(fecha)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // Date.UTC "corrige" el 30 de febrero al 2 de marzo: si no vuelve igual, la fecha no existe.
  return new Date(t).toISOString().slice(0, 10) === fecha ? t / DIA_MS : null
}

function aFecha(dia: number): string {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10)
}

function diaObligatorio(fecha: string): number {
  const d = aDia(fecha)
  if (d === null) throw new Error(`fecha inválida: "${fecha}"`)
  return d
}

export function diasDelPeriodo(p: Periodo): number {
  return diaObligatorio(p.hasta) - diaObligatorio(p.desde) + 1
}

/** La última quincena CERRADA a la fecha `hoy`: del 16 al fin del mes anterior, o del 1 al 15. */
export function quincenaQueCerro(hoy: string): Periodo {
  const [anio, mes, dia] = hoy.split('-').map(Number)
  diaObligatorio(hoy)
  if (dia >= 16) {
    const m = String(mes).padStart(2, '0')
    return { desde: `${anio}-${m}-01`, hasta: `${anio}-${m}-15` }
  }
  const anioAnterior = mes === 1 ? anio - 1 : anio
  const mesAnterior = mes === 1 ? 12 : mes - 1
  const ultimo = new Date(Date.UTC(anio, mes - 1, 0)).getUTCDate()
  const m = String(mesAnterior).padStart(2, '0')
  return { desde: `${anioAnterior}-${m}-16`, hasta: `${anioAnterior}-${m}-${String(ultimo).padStart(2, '0')}` }
}

/** El último bloque completo de 15 días desde la captación, o null si todavía no cerró ninguno. */
export function cicloDeLaPropiedad(captada: string, hoy: string): Periodo | null {
  const inicio = diaObligatorio(captada)
  const bloques = Math.floor((diaObligatorio(hoy) - inicio) / 15)
  if (bloques < 1) return null
  const desde = inicio + (bloques - 1) * 15
  return { desde: aFecha(desde), hasta: aFecha(desde + 14) }
}

/** Una propiedad captada a mitad de período: el informe arranca ese día; captada después, no hay informe. */
export function recortarALaCaptacion(p: Periodo, captada: string | null): Periodo | null {
  if (!captada) return p
  const c = diaObligatorio(captada)
  if (c > diaObligatorio(p.hasta)) return null
  if (c > diaObligatorio(p.desde)) return { desde: captada, hasta: p.hasta }
  return p
}

export type RangoValidado = { ok: true; desde: string; hasta: string } | { ok: false; error: string }

export function validarRango(desde: string, hasta: string, hoy: string): RangoValidado {
  const d = aDia(desde)
  const h = aDia(hasta)
  if (d === null || h === null) return { ok: false, error: 'Elegí fechas válidas' }
  if (h < d) return { ok: false, error: 'La fecha final tiene que ser posterior a la inicial' }
  if (h > diaObligatorio(hoy)) return { ok: false, error: 'El informe no puede terminar en el futuro' }
  if (h - d + 1 > MAX_DIAS_PERIODO) return { ok: false, error: `El período no puede pasar de ${MAX_DIAS_PERIODO} días` }
  return { ok: true, desde, hasta }
}
