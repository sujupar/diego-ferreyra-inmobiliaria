/**
 * Fechas y horas de las visitas, SIEMPRE en horario argentino.
 *
 * Por qué existe: varios emails y pantallas formateaban sin zona horaria y en el
 * servidor (UTC) la hora salía corrida 3 h. Acá hay UNA forma de construir un
 * instante (fecha + hora de Argentina) y UNA de mostrarlo.
 *
 * Argentina no tiene horario de verano: el desfase es fijo -03:00 (mismo criterio
 * que lib/leads/visit-scheduling.ts y lib/filters/rango-fechas.ts).
 * Módulo puro y seguro para el navegador: no importa nada de servidor.
 */
export const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires'
export const MAX_DIAS_ATRAS = 60
export const MAX_DIAS_ADELANTE = 180

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const MS_DIA = 86_400_000

const formatoFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_ARGENTINA, year: 'numeric', month: '2-digit', day: '2-digit',
})
const formatoHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA_ARGENTINA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function fechaEnArgentina(d: Date): string {
  return formatoFecha.format(d)
}

export function horaEnArgentina(d: Date): string {
  return formatoHora.format(d)
}

/** Fecha (AAAA-MM-DD) + hora (HH:MM) de Argentina → instante. `null` si no existe. */
export function construirInstante(fecha: string, hora: string): Date | null {
  if (!FECHA.test(fecha) || !HORA.test(hora)) return null
  const d = new Date(`${fecha}T${hora}:00-03:00`)
  if (Number.isNaN(d.getTime())) return null
  // `new Date('2026-02-31…')` no da error: JS lo corre al 3 de marzo. Si el día
  // no sobrevive el ida y vuelta, la fecha no existe.
  if (fechaEnArgentina(d) !== fecha) return null
  return d
}

export function validarHorarioDeVisita(
  fecha: string,
  hora: string,
  ahora: Date = new Date(),
): { ok: true; instante: Date } | { ok: false; error: string } {
  const instante = construirInstante(fecha, hora)
  if (!instante) return { ok: false, error: 'Elegí un día y una hora válidos' }
  const dias = (instante.getTime() - ahora.getTime()) / MS_DIA
  if (dias < -MAX_DIAS_ATRAS) return { ok: false, error: 'Solo se pueden registrar visitas de los últimos 60 días' }
  if (dias > MAX_DIAS_ADELANTE) return { ok: false, error: 'Elegí una fecha dentro de los próximos 6 meses' }
  return { ok: true, instante }
}

function aFecha(v: string | Date): Date {
  return typeof v === 'string' ? new Date(v) : v
}

/** Día de la semana de un AAAA-MM-DD (ancla al mediodía UTC: nunca cruza de día). */
function diaDeSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay()
}

/** "sáb 10/10 · 10:30" */
export function formatearFechaHora(v: string | Date): string {
  const d = aFecha(v)
  const fecha = fechaEnArgentina(d)
  const [, mes, dia] = fecha.split('-')
  return `${DIAS_CORTOS[diaDeSemana(fecha)]} ${dia}/${mes} · ${horaEnArgentina(d)}`
}

/** "sábado 10 de octubre, 10:30" */
export function formatearFechaLarga(v: string | Date): string {
  const d = aFecha(v)
  const fecha = fechaEnArgentina(d)
  const [, mes, dia] = fecha.split('-')
  return `${DIAS_LARGOS[diaDeSemana(fecha)]} ${Number(dia)} de ${MESES[Number(mes) - 1]}, ${horaEnArgentina(d)}`
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diasParaElegir(hoy: string, cantidad = 7): Array<{ fecha: string; etiqueta: string; numero: string }> {
  return Array.from({ length: cantidad }, (_, i) => {
    const fecha = sumarDias(hoy, i)
    const corto = DIAS_CORTOS[diaDeSemana(fecha)]
    const etiqueta = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : corto.charAt(0).toUpperCase() + corto.slice(1)
    return { fecha, etiqueta, numero: String(Number(fecha.slice(8, 10))) }
  })
}

export const HORARIOS_SUGERIDOS: readonly string[] = Array.from({ length: 26 }, (_, i) => {
  const minutos = 8 * 60 + i * 30
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
})
