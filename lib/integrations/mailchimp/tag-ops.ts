import 'server-only'
import { ALL_SEQUENCE_TAGS, type SequenceTag } from './mapping'

/**
 * Dado el tag objetivo, decide qué tags poner active/inactive. Un deal está en
 * UNA secuencia a la vez: se activa el target y se desactivan los demás.
 * NO gestiona los tags internos de encadenado (`seq-*-2`): esos los maneja el
 * flujo de Mailchimp y la SALIDA de esos flujos es por la condición sobre
 * CRM_STAGE, no por el tag. Función pura.
 */
export function computeTagOps(target: SequenceTag | null): { activate: SequenceTag | null; deactivate: SequenceTag[] } {
  return { activate: target, deactivate: ALL_SEQUENCE_TAGS.filter(t => t !== target) }
}
