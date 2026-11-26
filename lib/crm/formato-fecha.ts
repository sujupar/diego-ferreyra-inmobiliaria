// Cómo se escriben las fechas en la ficha (maqueta `base.js`, `fmt.relativa` y
// `fmt.vencimiento`), siempre en hora de Argentina (decisión 8.4). Puro: recibe `ahora`
// por parámetro. Si se calculara con la zona del navegador, una persona del equipo que
// abre la ficha desde otro país vería "ayer" donde el resto ve "hoy".
import { diasDeCalendarioEntre, enArgentina, instanteDesdeAR } from './horario-laboral'
import { vencimientoDeTarea } from './tareas-ficha'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function aInstante(x: string | Date): Date | null {
  const d = typeof x === 'string' ? new Date(x) : x
  return Number.isNaN(d.getTime()) ? null : d
}

/** "09:00" o "09:00:00" (columna `time`) → "9:00". */
export function horaCorta(hora: string): string {
  const [h = '0', m = '00'] = hora.split(':')
  return `${Number(h)}:${m}`
}

/** "2026-11-30" → "lun 30 nov". */
export function diaCorto(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return `${DIAS[dia]} ${d} ${MESES[m - 1]}`
}

/** "mié 25 nov 2026, 10:15". Vacío si no se entiende la fecha. */
export function fechaExacta(instante: string | Date): string {
  const d = aInstante(instante)
  if (!d) return ''
  const ar = enArgentina(d)
  return `${diaCorto(ar.fecha)} ${ar.fecha.slice(0, 4)}, ${horaCorta(ar.hora)}`
}

/**
 * Pasado: "recién", "hace 12 min", "hace 2 h", "ayer", "hace 3 días", "12 nov".
 * Futuro: "hoy 16:30", "mañana 9:00", "vie 27 nov, 9:00".
 */
export function fechaRelativa(instante: string | Date, ahora: Date): string {
  const d = aInstante(instante)
  if (!d) return ''
  const minutos = Math.round((ahora.getTime() - d.getTime()) / 60_000)
  const dias = diasDeCalendarioEntre(d, ahora)
  const ar = enArgentina(d)
  if (minutos < 0) {
    if (dias === 0) return `hoy ${horaCorta(ar.hora)}`
    if (dias === -1) return `mañana ${horaCorta(ar.hora)}`
    return `${diaCorto(ar.fecha)}, ${horaCorta(ar.hora)}`
  }
  if (minutos < 1) return 'recién'
  if (dias === 0) return minutos < 60 ? `hace ${minutos} min` : `hace ${Math.floor(minutos / 60)} h`
  if (dias === 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  return `${Number(ar.fecha.slice(8, 10))} ${MESES[Number(ar.fecha.slice(5, 7)) - 1]}`
}

/** Fecha y hora de Argentina (las de una tarea) dichas como en el aviso: "mañana 9:00". */
export function cuandoEs(fecha: string, hora: string, ahora: Date): string {
  try {
    return fechaRelativa(instanteDesdeAR(fecha, hora.slice(0, 5)), ahora)
  } catch (err) {
    console.warn('[cuandoEs] fecha u hora que no se entiende', { fecha, hora, err })
    return `${fecha} ${hora.slice(0, 5)}`
  }
}

export type EstadoVencimiento = 'vencida' | 'hoy' | 'proxima' | 'sinfecha'

/**
 * Texto del vencimiento de una tarea. Si está vencida o no lo decide `vencimientoDeTarea`
 * (la misma regla que usa el resto de la ficha); acá solo se arma el texto.
 */
export function textoVencimiento(
  t: { due_date: string | null; due_time: string | null },
  ahora: Date,
): { texto: string; estado: EstadoVencimiento } {
  if (!t.due_date) return { texto: 'Sin fecha', estado: 'sinfecha' }
  const v = vencimientoDeTarea(t, ahora)
  const hora = t.due_time ? horaCorta(t.due_time) : null
  if (v.vencida) {
    const dias = v.dias ?? 0
    if (dias > 0) return { texto: `Vencida hace ${dias} ${dias === 1 ? 'día' : 'días'}`, estado: 'vencida' }
    // El mismo día: la hora ya pasó (con fecha sola nunca vence en el día).
    let min = 0
    try {
      min = Math.round((ahora.getTime() - instanteDesdeAR(t.due_date, (t.due_time ?? '00:00').slice(0, 5)).getTime()) / 60_000)
    } catch {
      // `vencimientoDeTarea` ya la habría dado por no vencida; queda la palabra sola.
      return { texto: 'Vencida', estado: 'vencida' }
    }
    return { texto: min >= 60 ? `Vencida hace ${Math.floor(min / 60)} h` : `Vencida hace ${Math.max(1, min)} min`, estado: 'vencida' }
  }
  const hoy = enArgentina(ahora).fecha
  if (t.due_date === hoy) return { texto: hora ? `Hoy ${hora}` : 'Hoy', estado: 'hoy' }
  let dias: number
  try {
    dias = diasDeCalendarioEntre(ahora, instanteDesdeAR(t.due_date, '12:00'))
  } catch {
    return { texto: t.due_date, estado: 'proxima' }
  }
  if (dias === 1) return { texto: hora ? `Mañana ${hora}` : 'Mañana', estado: 'proxima' }
  return { texto: hora ? `${diaCorto(t.due_date)}, ${hora}` : diaCorto(t.due_date), estado: 'proxima' }
}
