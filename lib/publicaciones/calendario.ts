/**
 * Calendario de publicación: de un ritmo ("2 por día", "1 por semana"…) a los
 * instantes exactos en que sale cada video.
 *
 * Argentina es UTC−3 FIJO (sin horario de verano desde 2009), así que las horas
 * se arman con el offset literal `-03:00` y no hace falta una base de zonas.
 * Todo se devuelve en `Date` (UTC por dentro); la base guarda `timestamptz`.
 *
 * Regla que no se negocia: nunca se programa nada en el pasado. Si el inicio es
 * hoy y los horarios ya pasaron, el primer video va al siguiente horario libre.
 */

export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = domingo

export type Ritmo =
  | { tipo: 'todos_ya' }
  | { tipo: 'por_dia'; cantidad: 1 | 2 | 3 }
  | { tipo: 'por_semana' }
  | { tipo: 'personalizado'; porDia: number; dias: DiaSemana[]; horarios: string[] }

export interface HorariosPorDefecto {
  '1': string[]
  '2': string[]
  '3': string[]
  semana: string[]
}

export interface OpcionesCalendario {
  ritmo: Ritmo
  /** YYYY-MM-DD, fecha argentina. */
  inicio: string
  soloHabiles: boolean
  horarios: HorariosPorDefecto
  ahora: Date
}

const OFFSET_MS = 3 * 60 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000
const MINUTO_MS = 60 * 1000
const HORARIO_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
/** Tope de días a recorrer: evita un loop eterno ante un ritmo sin días válidos. */
const MAX_DIAS = 3660

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function aHoraArgentina(d: Date): { fecha: string; hora: string; diaSemana: DiaSemana } {
  const ar = new Date(d.getTime() - OFFSET_MS)
  const iso = ar.toISOString()
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16), diaSemana: ar.getUTCDay() as DiaSemana }
}

export function mananaEnArgentina(ahora: Date): string {
  return aHoraArgentina(new Date(ahora.getTime() + DIA_MS)).fecha
}

function instante(fecha: string, hora: string): Date {
  return new Date(`${fecha}T${hora}:00-03:00`)
}

function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10)
}

function diaDeSemana(fecha: string): DiaSemana {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay() as DiaSemana
}

function validarHorarios(horarios: string[]): string[] {
  if (horarios.length === 0) throw new Error('Falta al menos un horario')
  for (const h of horarios) {
    if (!HORARIO_RE.test(h)) throw new Error(`Horario inválido: "${h}"`)
  }
  return [...new Set(horarios)].sort()
}

/** Horarios y días permitidos según el ritmo. */
function reglasDelRitmo(op: OpcionesCalendario): { horarios: string[]; dias: Set<DiaSemana> } {
  const { ritmo } = op
  const todos: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6]
  switch (ritmo.tipo) {
    case 'por_dia':
      return { horarios: validarHorarios(op.horarios[String(ritmo.cantidad) as '1' | '2' | '3']), dias: new Set(todos) }
    case 'por_semana':
      return { horarios: validarHorarios(op.horarios.semana), dias: new Set([diaDeSemana(op.inicio)]) }
    case 'personalizado': {
      if (ritmo.dias.length === 0) throw new Error('Elegí al menos un día de la semana')
      if (!Number.isInteger(ritmo.porDia) || ritmo.porDia < 1) throw new Error('La cantidad por día tiene que ser 1 o más')
      return { horarios: validarHorarios(ritmo.horarios).slice(0, ritmo.porDia), dias: new Set(ritmo.dias) }
    }
    case 'todos_ya':
      return { horarios: [], dias: new Set(todos) }
  }
}

export function armarCalendario(cantidad: number, op: OpcionesCalendario): Date[] {
  if (cantidad <= 0) return []

  if (op.ritmo.tipo === 'todos_ya') {
    const primero = Math.ceil((op.ahora.getTime() + 5 * MINUTO_MS) / MINUTO_MS) * MINUTO_MS
    return Array.from({ length: cantidad }, (_, i) => new Date(primero + i * 10 * MINUTO_MS))
  }

  if (!FECHA_RE.test(op.inicio)) throw new Error(`Fecha de inicio inválida: "${op.inicio}"`)
  const { horarios, dias } = reglasDelRitmo(op)
  const salida: Date[] = []

  for (let i = 0; i < MAX_DIAS && salida.length < cantidad; i++) {
    const fecha = sumarDias(op.inicio, i)
    const dia = diaDeSemana(fecha)
    if (!dias.has(dia)) continue
    if (op.soloHabiles && (dia === 0 || dia === 6)) continue
    for (const hora of horarios) {
      const d = instante(fecha, hora)
      if (d.getTime() <= op.ahora.getTime()) continue
      salida.push(d)
      if (salida.length === cantidad) break
    }
  }
  if (salida.length < cantidad) throw new Error('Con esos días y horarios no entran todos los videos')
  return salida
}

function diaCorto(d: Date): string {
  const { fecha, diaSemana } = aHoraArgentina(d)
  return `${NOMBRES_DIA[diaSemana]} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
}

function unirHoras(horas: string[]): string {
  if (horas.length <= 1) return horas.join('')
  return `${horas.slice(0, -1).join(', ')} y ${horas[horas.length - 1]}`
}

/** "20 videos, 1 por día a las 19:00 → del viernes 30/10 al miércoles 18/11". */
export function fraseCalendario(fechas: Date[], ritmo: Ritmo): string {
  if (fechas.length === 0) return 'Todavía no hay videos'
  const n = fechas.length
  const cuantos = `${n} ${n === 1 ? 'video' : 'videos'}`
  const ordenadas = [...fechas].sort((a, b) => a.getTime() - b.getTime())
  const primera = ordenadas[0]
  const ultima = ordenadas[n - 1]
  const horas = [...new Set(ordenadas.map((d) => aHoraArgentina(d).hora))].sort()

  let como: string
  switch (ritmo.tipo) {
    case 'todos_ya':
      como = `uno cada 10 minutos desde las ${aHoraArgentina(primera).hora}`
      break
    case 'por_dia':
      como = `${ritmo.cantidad} por día a las ${unirHoras(horas)}`
      break
    case 'por_semana':
      como = `1 por semana a las ${unirHoras(horas)}`
      break
    case 'personalizado':
      como = `${ritmo.porDia} por día a las ${unirHoras(horas)}`
      break
  }

  const mismoDia = aHoraArgentina(primera).fecha === aHoraArgentina(ultima).fecha
  const cuando = mismoDia ? `el ${diaCorto(primera)}` : `del ${diaCorto(primera)} al ${diaCorto(ultima)}`
  return `${cuantos}, ${como} → ${cuando}`
}

/**
 * Al reordenar arrastrando, los horarios se quedan quietos y los videos se mueven:
 * el que queda primero toma el horario más temprano. Un video con hora puesta a
 * mano conserva la suya y no consume ningún horario del resto.
 */
export function reasignarHorarios<T extends { id: string; programado_para: string | null; hora_manual: boolean }>(
  ordenados: T[],
): T[] {
  const libres = ordenados
    .filter((v) => !v.hora_manual && v.programado_para)
    .map((v) => v.programado_para as string)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
  let i = 0
  return ordenados.map((v) => {
    if (v.hora_manual) return v
    const programado_para = libres[i++] ?? null
    return { ...v, programado_para }
  })
}
