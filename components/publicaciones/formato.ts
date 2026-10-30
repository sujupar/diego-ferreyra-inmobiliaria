import { aHoraArgentina } from '@/lib/publicaciones/calendario'

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function duracion(seg: number | null | undefined): string {
  if (!seg || seg <= 0) return ''
  const s = Math.round(seg)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function fechaCorta(fechaIso: string): string {
  return `${fechaIso.slice(8, 10)}/${fechaIso.slice(5, 7)}`
}

/** "Jueves 30/10" de un instante, en hora argentina. */
export function diaLargo(instante: string | Date): string {
  const { fecha, diaSemana } = aHoraArgentina(new Date(instante))
  return `${DIAS[diaSemana]} ${fechaCorta(fecha)}`
}

export function megas(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}
