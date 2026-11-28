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

/**
 * Para cuándo quedó una tarea recién agendada: "ahora" si ya venció o vence en este minuto
 * (el WhatsApp de la cadencia que "se manda ya", o un reintento tardío), y si no "hoy 13:30",
 * "mañana 10:00"... Nunca "recién" ni "hace 1 min" (crm-cadencia-paula, auditoría 1).
 */
export function paraCuando(fecha: string, hora: string, ahora: Date): string {
  try {
    // 60 s de margen: el reloj del navegador puede ir unos segundos atrás del servidor.
    if (instanteDesdeAR(fecha, hora.slice(0, 5)).getTime() <= ahora.getTime() + 60_000) return 'ahora'
  } catch {
    // lo resuelve cuandoEs con su texto de respaldo
  }
  return cuandoEs(fecha, hora, ahora)
}

/**
 * "Tarea creada sola · …" en la línea de tiempo, que se lee días después: futura → "mañana
 * 10:00"; ya pasada → el día y la hora exactos ("mié 25 nov, 10:20"), nunca "ahora" ni "hace
 * N" (crm-cadencia-paula, revisión de código 1). Sin hora: desde las 9:00 (todo el día).
 */
export function vencimientoEnHistorial(fecha: string, hora: string | null, ahora: Date): string {
  const h = (hora ?? '09:00').slice(0, 5)
  try {
    if (instanteDesdeAR(fecha, h).getTime() > ahora.getTime()) return cuandoEs(fecha, h, ahora)
  } catch {
    return `${fecha} ${h}`
  }
  return `${diaCorto(fecha)}, ${horaCorta(h)}`
}

export type EstadoVencimiento = 'vencida' | 'hoy' | 'proxima' | 'sinfecha'

/**
 * Opciones de la fila de la cartera (crm-cartera-por-rol, D5); la ficha no las pasa y sus
 * textos no cambian.
 * - `todoElDia`: sin hora se dice "Hoy, todo el día" / "Mañana, todo el día" (tasación sin
 *   hora, tarea `all_day`) en vez de "Hoy" a secas.
 * - `espera`: la primera llamada de un lead que entró en horario laboral vence en el
 *   momento del registro (D3); vencida, se dice cuánto espera desde ese momento ("Espera
 *   hace 28 min") en vez de "Vencida hace…". Quién la marca así lo decide `proximoPaso`.
 */
export interface OpcionesVencimiento {
  todoElDia?: boolean
  espera?: { registradoEn: string }
}

/**
 * Texto del vencimiento de una tarea. Si está vencida o no lo decide `vencimientoDeTarea`
 * (la misma regla que usa el resto de la ficha); acá solo se arma el texto.
 */
export function textoVencimiento(
  t: { due_date: string | null; due_time: string | null },
  ahora: Date,
  opciones: OpcionesVencimiento = {},
): { texto: string; estado: EstadoVencimiento } {
  if (!t.due_date) return { texto: 'Sin fecha', estado: 'sinfecha' }
  const v = vencimientoDeTarea(t, ahora)
  const hora = t.due_time ? horaCorta(t.due_time) : null
  const sinHora = (palabra: string) => (opciones.todoElDia ? `${palabra}, todo el día` : palabra)
  if (v.vencida && opciones.espera) {
    const desde = aInstante(opciones.espera.registradoEn)
    if (desde) {
      const min = (ahora.getTime() - desde.getTime()) / 60_000
      return { texto: `Espera hace ${duracion(Math.max(1, min))}`, estado: 'vencida' }
    }
  }
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
  if (t.due_date === hoy) return { texto: hora ? `Hoy ${hora}` : sinHora('Hoy'), estado: 'hoy' }
  let dias: number
  try {
    dias = diasDeCalendarioEntre(ahora, instanteDesdeAR(t.due_date, '12:00'))
  } catch {
    return { texto: t.due_date, estado: 'proxima' }
  }
  if (dias === 1) return { texto: hora ? `Mañana ${hora}` : sinHora('Mañana'), estado: 'proxima' }
  return { texto: hora ? `${diaCorto(t.due_date)}, ${hora}` : sinHora(diaCorto(t.due_date)), estado: 'proxima' }
}

/**
 * Tiempo relativo de la fila de la cartera (spec "Último contacto", "Formato del tiempo").
 * Igual que `fechaRelativa` hasta los 6 días; desde los 7, siempre "hace N días" (la ficha
 * pasa a la fecha: en la lista se compara cuánto hace, y "12 nov" obliga a hacer la
 * cuenta). Un instante futuro (relojes desfasados) es "recién".
 */
export function haceCuanto(at: string, ahora: Date): string {
  const d = aInstante(at)
  if (!d) return ''
  if (d.getTime() > ahora.getTime()) return 'recién'
  const dias = diasDeCalendarioEntre(d, ahora)
  if (dias < 7) return fechaRelativa(d, ahora)
  return `hace ${dias} días`
}

/** '28 min' | '16 h 20 min' | '2 días 18 h' (con días, sin minutos). Negativo → '0 min'. */
export function duracion(minutos: number): string {
  const m = Math.max(0, Math.floor(minutos))
  if (m < 60) return `${m} min`
  if (m < 1440) {
    const h = Math.floor(m / 60)
    const resto = m % 60
    return resto ? `${h} h ${resto} min` : `${h} h`
  }
  const dias = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const textoDias = `${dias} ${dias === 1 ? 'día' : 'días'}`
  return h ? `${textoDias} ${h} h` : textoDias
}
