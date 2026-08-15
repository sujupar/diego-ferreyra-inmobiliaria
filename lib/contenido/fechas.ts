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
