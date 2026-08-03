import 'server-only'

export type SequenceTag =
  | 'seq-solicita'
  | 'seq-agendada'
  | 'seq-no-realizada'
  | 'seq-realizada'
  | 'seq-seguimiento'

export const ALL_SEQUENCE_TAGS: SequenceTag[] = [
  'seq-solicita', 'seq-agendada', 'seq-no-realizada', 'seq-realizada', 'seq-seguimiento',
]

export interface DealTagInput {
  stage: string
  origin: string | null
  scheduledDate: string | null
}

/**
 * Contrato etapa→tag (spec 2026-08-03). Devuelve el tag de secuencia del estado
 * ACTUAL del deal, o null si no debe estar en ninguna secuencia. Función pura.
 * Nota: `scheduled` sin fecha es "solicitud" en la semántica del CRM
 * (ver applyCRMStageFilter en lib/supabase/deals.ts).
 */
export function resolveSequenceTag(input: DealTagInput): SequenceTag | null {
  const { stage, origin, scheduledDate } = input
  switch (stage) {
    case 'request':
      return origin === 'embudo' ? 'seq-solicita' : null
    case 'scheduled':
      if (scheduledDate) return 'seq-agendada'
      return origin === 'embudo' ? 'seq-solicita' : null
    case 'not_visited':
      return 'seq-no-realizada'
    case 'visited':
      return 'seq-realizada'
    case 'appraisal_sent':
    case 'followup':
      return 'seq-seguimiento'
    default:
      return null // captured, lost, comprador, clase_gratuita, etc. → STOP
  }
}
