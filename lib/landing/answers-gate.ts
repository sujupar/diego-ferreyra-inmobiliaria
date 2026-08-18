/**
 * Gate de publicación de la landing.
 *
 * QUÉ PROTEGE (decisión del usuario, 2026-08-06): que no salga publicada una
 * landing con el copy GENÉRICO tal como lo escupió el generador. Ese copy no
 * conoce la propiedad; publicarlo con pauta encima es tirar plata.
 *
 * PERO "no genérico" tiene DOS caminos válidos, no uno:
 *   (a) responder las preguntas de co-creación y generar los textos con ellas, o
 *   (b) escribir los textos a mano en el editor.
 * La primera versión solo contemplaba (a) y dejaba encerrado a quien hizo (b):
 * la landing de Coghlan estaba escrita a mano, afinada y aprobada por el dueño,
 * y el sistema se negaba a publicarla pidiéndole que respondiera preguntas que
 * ni siquiera se ven desde el editor. La única salida que ofrecía era borrarla
 * y empezar de nuevo — perdiendo justo el trabajo que la hacía buena.
 *
 * Módulo puro y COMPARTIDO por el servidor (`publishLanding`) y la UI, para que
 * el asesor vea exactamente el mismo criterio en los dos lados.
 */

export const GATE_RESPUESTAS_MSG =
  'Antes de publicar, respondé las preguntas de la landing y generá los textos con tus respuestas ' +
  '(están en la ficha de la propiedad, sección "Landing Page"). ' +
  'Si preferís, escribí vos los textos en el editor: una landing editada a mano se publica sin más trámite. ' +
  'Lo que no se publica es el texto genérico tal como salió del generador.'

export interface EstadoWizard {
  questions?: { id: string }[]
  answers?: Record<string, string>
  copyFromAnswers?: boolean
}

export interface LandingParaGate {
  published_at?: string | null
  wizard_state?: EstadoWizard | null
  content?: unknown
  draft_content?: unknown
}

/** Preguntas sin responder (vacío = están todas). */
export function faltanRespuestas(ws: EstadoWizard): string[] {
  const questions = ws.questions ?? []
  if (questions.length === 0) return []
  const answers = ws.answers ?? {}
  return questions.filter(q => !(answers[q.id] ?? '').trim()).map(q => q.id)
}

/**
 * Serializa con las claves ORDENADAS. El borrador del editor se rearma desde el
 * registro de bloques, así que puede traer las mismas claves en otro orden: sin
 * normalizar, un `JSON.stringify` crudo diría "cambió" sobre un documento
 * idéntico y el gate se abriría solo.
 */
function estable(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null'
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`
  const obj = valor as Record<string, unknown>
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${estable(obj[k])}`).join(',')}}`
}

/**
 * ¿Los textos los escribió una persona?
 *
 * El borrador solo lo escribe el autosave del editor, así que un borrador que
 * DIFIERE del contenido publicado significa que alguien entró y cambió algo.
 * Se compara en vez de mirar solo si existe: abrir el editor sin tocar nada
 * guarda un borrador idéntico, y eso no es haber escrito nada.
 */
export function editadaAMano(landing: LandingParaGate): boolean {
  if (landing.draft_content == null) return false
  return estable(landing.draft_content) !== estable(landing.content)
}

/**
 * Motivo por el que NO se puede publicar, o `null` si se puede.
 * Es la ÚNICA definición del gate: servidor y UI la comparten.
 */
export function bloqueoDePublicacion(landing: LandingParaGate): string | null {
  // Re-publicar cambios de una landing que ya está viva nunca se bloquea.
  if (landing.published_at) return null

  const ws = landing.wizard_state ?? {}
  // Sin preguntas (landing legacy, o el enrich caído) no hay nada que exigir.
  if ((ws.questions ?? []).length === 0) return null

  // Camino (b): los textos los escribió una persona en el editor.
  if (editadaAMano(landing)) return null

  // Camino (a): preguntas respondidas Y copy generado con esas respuestas.
  if (faltanRespuestas(ws).length === 0 && ws.copyFromAnswers === true) return null

  return GATE_RESPUESTAS_MSG
}
