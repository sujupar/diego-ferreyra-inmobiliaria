/** Fechas de la Central de Contenido — módulo puro (testeado). Sin UTC: un día del calendario editorial es un día argentino. */

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function parseDate(d: string): Date {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(y, m - 1, dd)
}

/** Lunes de la semana a la que pertenece la fecha (YYYY-MM-DD → YYYY-MM-DD). */
export function mondayOf(d: string): string {
  const dt = parseDate(d)
  const wd = dt.getDay() === 0 ? 7 : dt.getDay()
  dt.setDate(dt.getDate() - (wd - 1))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

/** «Semana del 18 al 22 de agosto» (lunes a viernes). */
export function labelSemana(monday: string): string {
  const ini = parseDate(monday)
  const fin = new Date(ini)
  fin.setDate(fin.getDate() + 4)
  return ini.getMonth() === fin.getMonth()
    ? `Semana del ${ini.getDate()} al ${fin.getDate()} de ${MESES[ini.getMonth()]}`
    : `Semana del ${ini.getDate()}/${ini.getMonth() + 1} al ${fin.getDate()}/${fin.getMonth() + 1}`
}

/** «lun 18/8» */
export function labelDia(d: string): string {
  const dt = parseDate(d)
  return `${DIAS[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}`
}

const p2 = (n: number) => String(n).padStart(2, '0')
export function fmtDate(dt: Date): string {
  return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`
}

/** «agosto 2026» para el título de la vista mensual. */
export function labelMes(anchor: string): string {
  const [y, m] = anchor.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}

/** Suma meses a un ancla YYYY-MM. */
export function addMonths(anchor: string, delta: number): string {
  const [y, m] = anchor.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}`
}

/**
 * Grilla mensual estilo Google Calendar: semanas completas (lunes a domingo)
 * que cubren el mes YYYY-MM, incluyendo las colas de los meses vecinos.
 */
export function monthGrid(anchor: string): string[][] {
  const [y, m] = anchor.split('-').map(Number)
  const last = new Date(y, m, 0)
  const cursor = parseDate(mondayOf(fmtDate(new Date(y, m - 1, 1))))
  const weeks: string[][] = []
  while (weeks.length < 7 && (cursor <= last || cursor.getDay() !== 1 || weeks.length === 0)) {
    if (cursor.getDay() === 1) {
      if (cursor > last) break
      weeks.push([])
    }
    weeks[weeks.length - 1].push(fmtDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return weeks
}
