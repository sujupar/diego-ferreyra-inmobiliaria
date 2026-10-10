/**
 * Avisos (NO bloqueos) al elegir día y hora: el asesor ya tiene algo cerca, o la
 * propiedad ya tiene otra visita ese día. El "día" es el de Argentina: una visita
 * a las 23:30 cae en UTC al día siguiente y no tiene que mezclarse.
 */
import { fechaEnArgentina, horaEnArgentina } from './horario'
import type { VisitaAgendaR } from './tipos'

const VENTANA_ASESOR_MS = 60 * 60 * 1000

export function avisosDeChoque(input: {
  instante: Date
  propiedadId: string
  asesorId: string | null
  visitas: VisitaAgendaR[]
  excluirId?: string
}): string[] {
  const avisos = new Set<string>()
  const dia = fechaEnArgentina(input.instante)
  for (const v of input.visitas) {
    if (v.id === input.excluirId) continue
    const cuando = new Date(v.scheduled_at)
    const hora = horaEnArgentina(cuando)
    if (input.asesorId && v.advisor_id === input.asesorId &&
        Math.abs(cuando.getTime() - input.instante.getTime()) < VENTANA_ASESOR_MS) {
      avisos.add(`El asesor ya tiene una visita a las ${hora}${v.address ? ` en ${v.address}` : ''}`)
      continue
    }
    if (v.property_id === input.propiedadId && fechaEnArgentina(cuando) === dia) {
      avisos.add(`La propiedad ya tiene otra visita ese día a las ${hora}`)
    }
  }
  return [...avisos]
}
