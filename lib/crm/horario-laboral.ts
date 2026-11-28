// Horario laboral y fechas de Argentina (design.md D2). Puro: recibe el instante por
// parámetro y nunca lee el reloj. Toda fecha "de negocio" (día de la tarea, días desde la
// última llamada) se cuenta en hora de Argentina: con `toISOString()` una tarea cargada a
// las 22:00 caía al día siguiente (es lo que le pasa hoy a `getMyTasks`).

export const ZONA_AR = 'America/Argentina/Buenos_Aires'

// El horario de la coordinación (dueño, 2026-11-28, crm-cadencia-paula): Paula llama de 10 a
// 14. Lo leen la cadencia (día hábil siguiente, WhatsApp "ya"), la tarea de entrada de un
// lead y `minutosHabilesEntre` (las esperas "hábiles" del Inicio, el CRM y Métricas). Las
// tareas "todo el día" NO: avisan desde las 9:00 (`HORA_AVISO_TODO_EL_DIA` en agenda.ts).
export const HORARIO_LABORAL = { dias: [1, 2, 3, 4, 5], inicio: '10:00', fin: '14:00' } as const

export interface FechaHoraAR {
  fecha: string // YYYY-MM-DD
  hora: string // HH:MM
  diaSemana: number // 0 = domingo
}

const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_AR,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
})

const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function enArgentina(instante: Date): FechaHoraAR {
  const partes: Record<string, string> = {}
  for (const p of FORMATO.formatToParts(instante)) partes[p.type] = p.value
  const dia = DIAS[partes.weekday]
  if (dia === undefined) throw new Error(`Día de la semana inesperado: ${partes.weekday}`)
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
    diaSemana: dia,
  }
}

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Fecha válida del calendario como (año, mes, día); tira error si no lo es. */
function partesDeFecha(fecha: string): [number, number, number] {
  const m = RE_FECHA.exec(fecha)
  if (!m) throw new Error(`Fecha con formato inválido: "${fecha}" (se espera AAAA-MM-DD)`)
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const control = new Date(Date.UTC(a, mes - 1, d))
  if (control.getUTCFullYear() !== a || control.getUTCMonth() !== mes - 1 || control.getUTCDate() !== d) {
    throw new Error(`La fecha "${fecha}" no existe`)
  }
  return [a, mes, d]
}

/**
 * Instante que corresponde a esa fecha y hora de Argentina. Argentina no tiene horario
 * de verano, pero en vez de suponer −03:00 se calcula el desfase real de la zona en ese
 * día: si algún día lo vuelve a tener, esto sigue siendo correcto.
 */
export function instanteDesdeAR(fecha: string, hora: string): Date {
  const [a, mes, d] = partesDeFecha(fecha)
  const mh = RE_HORA.exec(hora)
  if (!mh) throw new Error(`Hora con formato inválido: "${hora}" (se espera HH:MM)`)
  const comoUTC = Date.UTC(a, mes - 1, d, Number(mh[1]), Number(mh[2]))
  const visto = enArgentina(new Date(comoUTC))
  const vistoUTC = Date.UTC(
    Number(visto.fecha.slice(0, 4)),
    Number(visto.fecha.slice(5, 7)) - 1,
    Number(visto.fecha.slice(8, 10)),
    Number(visto.hora.slice(0, 2)),
    Number(visto.hora.slice(3, 5)),
  )
  return new Date(comoUTC + (comoUTC - vistoUTC))
}

function diaSemanaDeFecha(fecha: string): number {
  const [a, mes, d] = partesDeFecha(fecha)
  return new Date(Date.UTC(a, mes - 1, d)).getUTCDay()
}

function sumarDias(fecha: string, dias: number): string {
  const [a, mes, d] = partesDeFecha(fecha)
  return new Date(Date.UTC(a, mes - 1, d + dias)).toISOString().slice(0, 10)
}

export function esDiaHabil(fecha: string): boolean {
  return (HORARIO_LABORAL.dias as readonly number[]).includes(diaSemanaDeFecha(fecha))
}

/**
 * En horario (día hábil, de `inicio` a antes de `fin`): ese día y esa hora. Antes del inicio de
 * un día hábil: ese día al inicio. Si no: el día hábil siguiente al inicio. La usan la tarea
 * de entrada de un lead y el WhatsApp de la cadencia (crm-cadencia-paula, D2).
 */
export function enHorarioOProximo(instante: Date): { fecha: string; hora: string } {
  const a = enArgentina(instante)
  const hora = a.hora.slice(0, 5)
  if (esDiaHabil(a.fecha)) {
    if (hora < HORARIO_LABORAL.inicio) return { fecha: a.fecha, hora: HORARIO_LABORAL.inicio }
    if (hora < HORARIO_LABORAL.fin) return { fecha: a.fecha, hora }
  }
  return siguienteDiaHabil(instante)
}

/** El primer día hábil POSTERIOR al día de hoy en Argentina, a la hora de inicio. */
export function siguienteDiaHabil(ahora: Date): { fecha: string; hora: string } {
  let fecha = sumarDias(enArgentina(ahora).fecha, 1)
  while (!esDiaHabil(fecha)) fecha = sumarDias(fecha, 1)
  return { fecha, hora: HORARIO_LABORAL.inicio }
}

function diaNumerico(fecha: string): number {
  const [a, mes, d] = partesDeFecha(fecha)
  return Date.UTC(a, mes - 1, d) / 86_400_000
}

/** Días de calendario de Argentina de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasDeCalendarioEntre(desde: Date, hasta: Date): number {
  return diaNumerico(enArgentina(hasta).fecha) - diaNumerico(enArgentina(desde).fecha)
}

/**
 * Minutos de horario laboral (días hábiles, de `inicio` a `fin`, en hora de Argentina) entre
 * dos instantes. Es la espera "hábil" de una solicitud en "Lo que está trabado": una que
 * entró el viernes a las 13:00 y nadie llamó hasta el lunes a las 10:30 esperó 1 h 30 min
 * hábiles, no 69 h. Se recorre día por día (no se aproxima con semanas) para que un feriado
 * futuro se pueda sumar acá sin cambiar la cuenta. Instantes inválidos o al revés → 0.
 */
export function minutosHabilesEntre(desde: Date, hasta: Date): number {
  const d = desde.getTime()
  const h = hasta.getTime()
  if (Number.isNaN(d) || Number.isNaN(h) || h <= d) return 0
  let total = 0
  const ultimo = enArgentina(hasta).fecha
  for (let fecha = enArgentina(desde).fecha; fecha <= ultimo; fecha = sumarDias(fecha, 1)) {
    if (!esDiaHabil(fecha)) continue
    const abre = Math.max(d, instanteDesdeAR(fecha, HORARIO_LABORAL.inicio).getTime())
    const cierra = Math.min(h, instanteDesdeAR(fecha, HORARIO_LABORAL.fin).getTime())
    if (cierra > abre) total += cierra - abre
  }
  return Math.floor(total / 60_000)
}
